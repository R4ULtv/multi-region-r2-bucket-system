import { Hono } from "hono";
import { getDistance } from "geolib";
import { bearerAuth } from "hono/bearer-auth";
import { Redis } from "@upstash/redis/cloudflare";

const app = new Hono();

const DEFAULT_BUCKET = "ENAM_BUCKET";

// Geographic positions of bucket servers
const BUCKET_POSITIONS = [
  {
    latitude: 48.2203697,
    longitude: 16.2972723,
    env: "EEUR_BUCKET",
    name: "EU East - Vienna",
    shortName: "EEUR",
  },
  {
    latitude: 53.3244116,
    longitude: -6.4105081,
    env: "WEUR_BUCKET",
    name: "EU West - Dublin",
    shortName: "WEUR",
  },
  {
    latitude: 38.89511,
    longitude: -77.03637,
    env: "ENAM_BUCKET",
    name: "US East - Washington D.C.",
    shortName: "ENAM",
  },
  {
    latitude: 37.7577607,
    longitude: -122.4787995,
    env: "WNAM_BUCKET",
    name: "US West - Los Angeles",
    shortName: "WNAM",
  },
  {
    latitude: 1.352083,
    longitude: 103.819836,
    env: "APAC_BUCKET",
    name: "Asia Pacific - Singapore",
    shortName: "APAC",
  },
];

// Error response helper functions
const createErrorResponse = (message, status) => {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
};

const objectNotFound = (objectName) => {
  return createErrorResponse(`Object '${objectName}' not found`, 404);
};

// Geographic utility functions
const calculateDistance = (userLocation, position) => {
  if (
    !userLocation?.latitude ||
    !userLocation?.longitude ||
    !position?.latitude ||
    !position?.longitude
  ) {
    return Infinity;
  }
  return getDistance(userLocation, position, 10);
};

const findNearestPosition = (userLocation, positions) => {
  if (!userLocation || !positions?.length) {
    return null;
  }

  let nearestPosition = null;
  let minDistance = Infinity;

  for (const position of positions) {
    const distance = calculateDistance(userLocation, position);
    if (distance < minDistance) {
      minDistance = distance;
      nearestPosition = position;
    }
  }

  return nearestPosition;
};

// Server validation
const getServerByName = (serverName) => {
  return BUCKET_POSITIONS.find((position) => position.shortName === serverName);
};

// Auth middleware
app.use(
  "*",
  bearerAuth({
    verifyToken: async (token, c) => {
      try {
        const redis = Redis.fromEnv(c.env);
        return await redis.sismember("valid_tokens", token);
      } catch (error) {
        console.error("Auth middleware error:", error);
        return false;
      }
    },
  }),
);

// GET endpoint to retrieve an object
app.get("/:objectName", async (c) => {
  const objectName = c.req.param("objectName");
  if (!objectName) {
    return createErrorResponse("Missing object name", 400);
  }

  try {
    // Get user's geographic location from Cloudflare
    const userLocation = c.req.raw.cf
      ? {
          latitude: c.req.raw.cf.latitude,
          longitude: c.req.raw.cf.longitude,
        }
      : null;

    // Find nearest bucket or use default
    const nearestPosition = findNearestPosition(userLocation, BUCKET_POSITIONS);
    const bucketEnv = nearestPosition?.env || DEFAULT_BUCKET;

    // Get object from bucket
    const object = await c.env[bucketEnv].get(objectName, {
      range: c.req.raw.headers,
      onlyIf: c.req.raw.headers,
    });

    if (object === null) {
      return objectNotFound(objectName);
    }

    // Set response headers
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("x-served-from", nearestPosition?.name || "Default server");

    // Handle range requests
    if (object.range) {
      headers.set(
        "content-range",
        `bytes ${object.range.offset}-${object.range.end ?? object.size - 1}/${object.size}`,
      );
    }

    // Determine appropriate status code
    const status = !object.body
      ? 304
      : c.req.header("range") !== null
        ? 206
        : 200;

    return new Response(object.body, { headers, status });
  } catch (error) {
    console.error("Error retrieving object:", error);
    return createErrorResponse("Error processing request", 500);
  }
});

// POST endpoint for creating multipart uploads
app.post("/:objectName", async (c) => {
  const objectName = c.req.param("objectName");
  const action = c.req.query("action");
  const serverName = c.req.header("X-Bucket-Name");

  if (!serverName) {
    return createErrorResponse(
      "Missing server name in X-Bucket-Name header",
      400,
    );
  }

  const server = getServerByName(serverName);
  if (!server) {
    return createErrorResponse(`Unknown server: ${serverName}`, 400);
  }

  try {
    switch (action) {
      case "mpu-create": {
        const multipartUpload =
          await c.env[server.env].createMultipartUpload(objectName);
        return c.json({
          key: multipartUpload.objectName,
          uploadId: multipartUpload.uploadId,
        });
      }

      case "mpu-complete": {
        const uploadId = c.req.query("uploadId");
        if (!uploadId) {
          return createErrorResponse("Missing uploadId parameter", 400);
        }

        const multipartUpload = c.env[server.env].resumeMultipartUpload(
          objectName,
          uploadId,
        );

        let completeBody;
        try {
          completeBody = await c.req.json();
        } catch (error) {
          return createErrorResponse("Invalid JSON in request body", 400);
        }

        if (!completeBody?.parts || !Array.isArray(completeBody.parts)) {
          return createErrorResponse(
            "Missing or invalid 'parts' in request body",
            400,
          );
        }

        try {
          const object = await multipartUpload.complete(completeBody.parts);
          return new Response(null, {
            status: 200,
            headers: {
              etag: object.httpEtag,
              "content-type": "application/json",
            },
          });
        } catch (error) {
          return createErrorResponse(error.message, 400);
        }
      }

      default:
        return createErrorResponse(
          `Unknown action: ${action || "undefined"}`,
          400,
        );
    }
  } catch (error) {
    console.error("Error in POST request:", error);
    return createErrorResponse("Server error processing multipart upload", 500);
  }
});

// PUT endpoint for uploading parts
app.put("/:objectName", async (c) => {
  const objectName = c.req.param("objectName");
  const action = c.req.query("action");
  const serverName = c.req.header("X-Bucket-Name");

  if (!serverName) {
    return createErrorResponse(
      "Missing server name in X-Bucket-Name header",
      400,
    );
  }

  const server = getServerByName(serverName);
  if (!server) {
    return createErrorResponse(`Unknown server: ${serverName}`, 400);
  }

  try {
    if (action === "mpu-uploadpart") {
      const uploadId = c.req.query("uploadId");
      const partNumberString = c.req.query("partNumber");

      if (!partNumberString || !uploadId) {
        return createErrorResponse(
          "Missing partNumber or uploadId parameters",
          400,
        );
      }

      if (!c.req.raw.body) {
        return createErrorResponse("Missing request body", 400);
      }

      const partNumber = parseInt(partNumberString, 10);
      if (isNaN(partNumber) || partNumber <= 0) {
        return createErrorResponse("Invalid part number", 400);
      }

      const multipartUpload = c.env[server.env].resumeMultipartUpload(
        objectName,
        uploadId,
      );

      try {
        const uploadedPart = await multipartUpload.uploadPart(
          partNumber,
          c.req.raw.body,
        );
        return c.json(uploadedPart);
      } catch (error) {
        return createErrorResponse(error.message, 400);
      }
    }

    return createErrorResponse(`Unknown action: ${action || "undefined"}`, 400);
  } catch (error) {
    console.error("Error in PUT request:", error);
    return createErrorResponse("Server error processing part upload", 500);
  }
});

export default app;
