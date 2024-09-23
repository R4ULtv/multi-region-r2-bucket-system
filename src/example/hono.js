import { Hono } from 'hono'; // you need to install `hono`
import { bearerAuth } from 'hono/bearer-auth';
import { getDistance } from 'geolib';
import { Redis } from "@upstash/redis/cloudflare"; // you need to install `@upstash/redis`

const app = new Hono();

function objectNotFound(objectName) {
  return new Response(`${objectName} not found`, { status: 404 });
}

const calculateDistance = (userLocation, position) => {
  if (!userLocation || !position) {
    return null;
  }
  return getDistance(userLocation, position);
};

const findNearestPosition = (userLocation, positions) => {
  if (!userLocation || positions.length === 0) {
    return null;
  }
  const distances = positions.map((position) => ({
    ...position,
    distance: calculateDistance(userLocation, position),
  }));
  return distances.reduce((minPosition, current) => 
    (current.distance < minPosition.distance ? current : minPosition)
  ).env;
};

const positions = [
  { latitude: 48.2203697, longitude: 16.2972723, env: 'EEUR_BUCKET', name: 'EU East - Vienna', shortName: 'EEUR' },
  { latitude: 53.3244116, longitude: -6.4105081, env: 'WEUR_BUCKET', name: 'EU West - Dublin', shortName: 'WEUR' },
  { latitude: 38.89511, longitude: -77.03637, env: 'ENAM_BUCKET', name: 'US East - Washington D.C.', shortName: 'ENAM' },
  { latitude: 37.7577607, longitude: -122.4787995, env: 'WNAM_BUCKET', name: 'US West - Los Angeles', shortName: 'WNAM' },
  { latitude: 1.352083, longitude: 103.819836, env: 'APAC_BUCKET', name: 'Asia Pacific - Singapore', shortName: 'APAC' },
];

// Middleware for token validation
app.use('*', async (c, next) => {
  const redis = Redis.fromEnv(c.env);
  const isValid = await bearerAuth({ token: async (token) => !(await redis.sismember("tokens", token)) })(c, next);
  if (!isValid.response) {
    return c.json({ error: 'Invalid Token' }, 401);
  }
  await next();
});

app.get('/:objectName', async (c) => {
  const objectName = c.req.param('objectName');
  if (!objectName) {
    return c.json({ error: 'Missing object' }, 400);
  }

  try {
    const userLocation = { latitude: c.env.CF.latitude, longitude: c.env.CF.longitude };
    const bucket = findNearestPosition(userLocation, positions) || c.env.ENAM_BUCKET;
    const object = await c.env[bucket].get(objectName, {
      range: c.req.raw.headers,
      onlyIf: c.req.raw.headers,
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

    const status = object.body ? (c.req.header('range') !== null ? 206 : 200) : 304;

    return new Response(object.body, { headers, status });
  } catch (e) {
    return c.json({ error: 'There was an error processing the request' }, 500);
  }
});

app.post('/:objectName', async (c) => {
  const objectName = c.req.param('objectName');
  const action = c.req.query('action');
  const serverName = c.req.header('X-Bucket-Name');

  if (!serverName) {
    return c.json({ error: 'Missing server name' }, 400);
  }

  const server = positions.find((position) => position.shortName === serverName);
  if (!server) {
    return c.json({ error: `Unknown server ${serverName}` }, 400);
  }

  switch (action) {
    case 'mpu-create': {
      const multipartUpload = await c.env[server.env].createMultipartUpload(objectName);
      return c.json({
        key: multipartUpload.objectName,
        uploadId: multipartUpload.uploadId,
      });
    }
    case 'mpu-complete': {
      const uploadId = c.req.query('uploadId');
      if (!uploadId) {
        return c.json({ error: 'Missing uploadId' }, 400);
      }

      const multipartUpload = c.env[server.env].resumeMultipartUpload(objectName, uploadId);
      const completeBody = await c.req.json();
      if (!completeBody) {
        return c.json({ error: 'Missing or incomplete body' }, 400);
      }

      try {
        const object = await multipartUpload.complete(completeBody.parts);
        return new Response(null, {
          headers: { etag: object.httpEtag },
        });
      } catch (error) {
        return c.json({ error: error.message }, 400);
      }
    }
    default:
      return c.json({ error: `Unknown action ${action} for POST` }, 400);
  }
});

app.put('/:objectName', async (c) => {
  const objectName = c.req.param('objectName');
  const action = c.req.query('action');
  const serverName = c.req.header('X-Bucket-Name');

  if (!serverName) {
    return c.json({ error: 'Missing server name' }, 400);
  }

  const server = positions.find((position) => position.shortName === serverName);
  if (!server) {
    return c.json({ error: `Unknown server ${serverName}` }, 400);
  }

  switch (action) {
    case 'mpu-uploadpart': {
      const uploadId = c.req.query('uploadId');
      const partNumberString = c.req.query('partNumber');
      if (!partNumberString || !uploadId) {
        return c.json({ error: 'Missing partNumber or uploadId' }, 400);
      }
      if (!c.req.raw.body) {
        return c.json({ error: 'Missing request body' }, 400);
      }

      const partNumber = parseInt(partNumberString);
      const multipartUpload = c.env[server.env].resumeMultipartUpload(objectName, uploadId);
      try {
        const uploadedPart = await multipartUpload.uploadPart(partNumber, c.req.raw.body);
        return c.json(uploadedPart);
      } catch (error) {
        return c.json({ error: error.message }, 400);
      }
    }
    default:
      return c.json({ error: `Unknown action ${action} for PUT` }, 400);
  }
});

export default app;