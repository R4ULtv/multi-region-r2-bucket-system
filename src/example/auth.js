import getDistance from 'geolib/es/getDistance';
import { Redis } from "@upstash/redis/cloudflare"; // you need to install @upstash/redis

function objectNotFound(objectName) {
  return new Response(`${objectName} not found`, { status: 404 });
}

// Calculates the distance between the user's location and a given position.
const calculateDistance = (userLocation, position) => {
  if (!userLocation || !position) {
    return null;
  }

  return getDistance(userLocation, position);
};

// Finds the nearest position (R2 bucket) to the user's location.
const findNearestPosition = (userLocation, positions) => {
  if (!userLocation || positions.length === 0) {
    return null;
  }

  const distances = positions.map((position) => ({
    ...position,
    distance: calculateDistance(userLocation, position),
  }));

  const nearestPosition = distances.reduce((minPosition, current) => (current.distance < minPosition.distance ? current : minPosition));

  return nearestPosition.env;
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const objectName = url.pathname.slice(1);
    const redis = Redis.fromEnv(env);

    const token = request.headers.get("Authorization");
    if (token === null) {
      return new Response("Missing Authorization header", { status: 401 });
    }

    const tokenParts = token.split(" ");
    if (tokenParts.length !== 2 || tokenParts[0] !== "Bearer") {
      return new Response("Invalid Authorization header", { status: 401 });
    }
    
    // check if the tokens exist in the tokens set in upstash redis
    if (await redis.sismember("tokens", tokenParts[1])) {
      return new Response("Invalid Token", { status: 401 });
    }

    // these are not the exact server locations but an indication of where they might be
    const positions = [
      { latitude: 48.2203697, longitude: 16.2972723, env: env.EEUR_BUCKET, name: 'EU East - Vienna', shortName: 'EEUR' },
      { latitude: 53.3244116, longitude: -6.4105081, env: env.WEUR_BUCKET, name: 'EU West - Dublin', shortName: 'WEUR' },
      { latitude: 38.89511, longitude: -77.03637, env: env.ENAM_BUCKET, name: 'US East - Washington D.C.', shortName: 'ENAM' },
      { latitude: 37.7577607, longitude: -122.4787995, env: env.WNAM_BUCKET, name: 'US West - Los Angeles', shortName: 'WNAM' },
      { latitude: 1.352083, longitude: 103.819836, env: env.APAC_BUCKET, name: 'Asia Pacific - Singapore', shortName: 'APAC' },
    ];

    switch (request.method) {
      case 'GET':
        if (objectName === '') {
          return new Response(`Missing object`, { status: 400 });
        }
        try {
          const bucket =
            findNearestPosition({ latitude: request.cf.latitude, longitude: request.cf.longitude }, positions) || env.ENAM_BUCKET;
          const object = await bucket.get(objectName, {
            range: request.headers,
            onlyIf: request.headers,
          });

          if (object === null) {
            return objectNotFound(objectName);
          }

          const headers = new Headers();
          object.writeHttpMetadata(headers);
          headers.set('etag', object.httpEtag);

          if (object.range) {
            headers.set('content-range', `bytes ${object.range.offset}-${object.range.end ?? object.size - 1}/${object.size}`);
          }

          const status = object.body ? (request.headers.get('range') !== null ? 206 : 200) : 304;

          return new Response(object.body, {
            headers,
            status,
          });
        } catch (e) {
          return new Response('There was an error processing the request', {
            status: 500,
          });
        }

      case 'POST':
        var action = url.searchParams.get('action');
        var serverName = request.headers.get('X-Bucket-Name');
        if (serverName === null) {
          return new Response(`Missing server name`, {
            status: 400,
          });
        }
        var server = positions.find((position) => position.shortName === serverName);

        if (server === undefined) {
          return new Response(`Unknown server ${serverName}`, {
            status: 400,
          });
        }

        switch (action) {
          case 'mpu-create': {
            const multipartUpload = await server.env.createMultipartUpload(objectName);
            return new Response(
              JSON.stringify({
                key: multipartUpload.objectName,
                uploadId: multipartUpload.uploadId,
              })
            );
          }
          case 'mpu-complete': {
            const uploadId = url.searchParams.get('uploadId');
            if (uploadId === null) {
              return new Response('Missing uploadId', { status: 400 });
            }

            const multipartUpload = server.env.resumeMultipartUpload(objectName, uploadId);

            const completeBody = await request.json();
            if (completeBody === null) {
              return new Response('Missing or incomplete body', {
                status: 400,
              });
            }

            // Error handling in case the multipart upload does not exist anymore
            try {
              const object = await multipartUpload.complete(completeBody.parts);
              return new Response(null, {
                headers: {
                  etag: object.httpEtag,
                },
              });
            } catch (error) {
              return new Response(error.message, { status: 400 });
            }
          }
          default:
            return new Response(`Unknown action ${action} for POST`, {
              status: 400,
            });
        }
      case 'PUT':
        var action = url.searchParams.get('action');
        var serverName = request.headers.get('X-Bucket-Name');
        if (serverName === null) {
          return new Response(`Missing server name`, {
            status: 400,
          });
        }
        var server = positions.find((position) => position.shortName === serverName);

        if (server === undefined) {
          return new Response(`Unknown server ${serverName}`, {
            status: 400,
          });
        }

        switch (action) {
          case 'mpu-uploadpart': {
            const uploadId = url.searchParams.get('uploadId');
            const partNumberString = url.searchParams.get('partNumber');
            if (partNumberString === null || uploadId === null) {
              return new Response('Missing partNumber or uploadId', {
                status: 400,
              });
            }
            if (request.body === null) {
              return new Response('Missing request body', { status: 400 });
            }

            const partNumber = parseInt(partNumberString);
            const multipartUpload = server.env.resumeMultipartUpload(objectName, uploadId);
            try {
              const uploadedPart = await multipartUpload.uploadPart(partNumber, request.body);
              return new Response(JSON.stringify(uploadedPart));
            } catch (error) {
              return new Response(error.message, { status: 400 });
            }
          }
          default:
            return new Response(`Unknown action ${action} for PUT`, {
              status: 400,
            });
        }
      default:
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { Allow: 'GET, POST, PUT' },
        });
    }
  },
};
