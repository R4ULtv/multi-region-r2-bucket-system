import getDistance from 'geolib/es/getDistance';

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

  const nearestPosition = distances.reduce((minPosition, current) => (current.distance < minPosition.distance ? current : minPosition));

  return nearestPosition.env;
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const objectName = url.pathname.slice(1);

    // these are not just the exact server locations but an indication of where they might be
    const positions = [
      { latitude: 48.2203697, longitude: 16.2972723, env: env.EEUR_BUCKET }, // EU East - Vienna
      { latitude: 53.3244116, longitude: -6.4105081, env: env.WEUR_BUCKET }, // EU West - Dublin
      { latitude: 38.89511, longitude: -77.03637, env: env.ENAM_BUCKET }, // US East - Washington D.C.
      { latitude: 37.7577607, longitude: -122.4787995, env: env.WNAM_BUCKET }, // US West - San Francisco
      { latitude: 1.352083, longitude: 103.819836, env: env.APAC_BUCKET }, // Asia/Pacific - Singapore
    ];
    if (request.method === 'GET') {
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
    } else {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: 'GET' },
      });
    }
  },
};
