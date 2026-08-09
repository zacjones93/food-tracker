export function GET() {
  return Response.json({
    applinks: {
      apps: [],
      details: [{
        appIDs: ["TV6G82BJ4U.com.wodsmith.listtoladle"],
        components: [
          { "/": "/recipes/*", comment: "Open Listo recipe links in the iOS app" },
          { "/": "/integrations/dial/recipes/*", comment: "Open Dial-to-Listo recipe and edit links" },
        ],
      }],
    },
  }, {
    headers: { "cache-control": "public, max-age=3600", "content-type": "application/json" },
  });
}
