/* Shared state routing. Pending states never silently fall back to Utah feeds. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MTSStates = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const states = [
  {
    "code": "AL",
    "name": "Alabama",
    "slug": "alabama",
    "home": {
      "lat": 32.8,
      "lng": -86.8,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Chicago",
    "status": "restricted",
    "sourceName": "",
    "sourceUrl": "https://www.algotraffic.com/cameras",
    "deployed": false,
    "officialViewerUrl": "https://www.algotraffic.com/cameras"
  },
  {
    "code": "AK",
    "name": "Alaska",
    "slug": "alaska",
    "home": {
      "lat": 64.0,
      "lng": -152.0,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Anchorage",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://511.alaska.gov/",
    "officialViewerUrl": "https://511.alaska.gov/",
    "deployed": false
  },
  {
    "code": "AZ",
    "name": "Arizona",
    "slug": "arizona",
    "home": {
      "lat": 34.0,
      "lng": -112.0,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Phoenix",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://www.az511.gov/",
    "officialViewerUrl": "https://www.az511.gov/",
    "deployed": false
  },
  {
    "code": "AR",
    "name": "Arkansas",
    "slug": "arkansas",
    "home": {
      "lat": 34.8,
      "lng": -92.2,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Chicago",
    "status": "restricted",
    "sourceName": "",
    "sourceUrl": "https://www.idrivearkansas.com/",
    "deployed": false,
    "officialViewerUrl": "https://www.idrivearkansas.com/"
  },
  {
    "code": "CA",
    "name": "California",
    "slug": "california",
    "home": {
      "lat": 37.5,
      "lng": -120.0,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Los_Angeles",
    "status": "ready",
    "sourceName": "Caltrans",
    "sourceUrl": "https://cwwp2.dot.ca.gov/documentation/cctv/cctv.htm",
    "officialViewerUrl": "https://quickmap.dot.ca.gov/",
    "deployed": false
  },
  {
    "code": "CO",
    "name": "Colorado",
    "slug": "colorado",
    "home": {
      "lat": 39.0,
      "lng": -105.5,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Denver",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://www.cotrip.org/",
    "officialViewerUrl": "https://www.cotrip.org/",
    "deployed": false
  },
  {
    "code": "CT",
    "name": "Connecticut",
    "slug": "connecticut",
    "home": {
      "lat": 41.6,
      "lng": -72.7,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/New_York",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://ctroads.org/",
    "officialViewerUrl": "https://ctroads.org/",
    "deployed": false
  },
  {
    "code": "DE",
    "name": "Delaware",
    "slug": "delaware",
    "home": {
      "lat": 39.0,
      "lng": -75.5,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/New_York",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://deldot.gov/map/index.shtml?tab=TrafficCameras",
    "officialViewerUrl": "https://deldot.gov/map/index.shtml?tab=TrafficCameras",
    "deployed": false
  },
  {
    "code": "FL",
    "name": "Florida",
    "slug": "florida",
    "home": {
      "lat": 28.0,
      "lng": -82.0,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/New_York",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://www.fl511.com/",
    "officialViewerUrl": "https://www.fl511.com/",
    "deployed": false
  },
  {
    "code": "GA",
    "name": "Georgia",
    "slug": "georgia",
    "home": {
      "lat": 32.7,
      "lng": -83.3,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/New_York",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://511ga.org/",
    "officialViewerUrl": "https://511ga.org/",
    "deployed": false
  },
  {
    "code": "HI",
    "name": "Hawaii",
    "slug": "hawaii",
    "home": {
      "lat": 20.7,
      "lng": -157.0,
      "zoom": 7,
      "count": 25
    },
    "timezone": "Pacific/Honolulu",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://www.goakamai.org/cameras/",
    "officialViewerUrl": "https://www.goakamai.org/cameras/",
    "deployed": false
  },
  {
    "code": "ID",
    "name": "Idaho",
    "slug": "idaho",
    "home": {
      "lat": 44.0,
      "lng": -114.0,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Boise",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://511.idaho.gov/",
    "officialViewerUrl": "https://511.idaho.gov/",
    "deployed": false
  },
  {
    "code": "IL",
    "name": "Illinois",
    "slug": "illinois",
    "home": {
      "lat": 40.0,
      "lng": -89.0,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Chicago",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://travelmidwest.com/",
    "deployed": false,
    "officialViewerUrl": "https://travelmidwest.com/"
  },
  {
    "code": "IN",
    "name": "Indiana",
    "slug": "indiana",
    "home": {
      "lat": 40.0,
      "lng": -86.0,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Indiana/Indianapolis",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://511in.org/",
    "deployed": false,
    "officialViewerUrl": "https://511in.org/"
  },
  {
    "code": "IA",
    "name": "Iowa",
    "slug": "iowa",
    "home": {
      "lat": 42.0,
      "lng": -93.5,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Chicago",
    "status": "ready",
    "sourceName": "Iowa DOT",
    "sourceUrl": "https://data.iowadot.gov/datasets/IowaDOT::traffic-cameras-3/about",
    "deployed": false,
    "officialViewerUrl": "https://511ia.org/"
  },
  {
    "code": "KS",
    "name": "Kansas",
    "slug": "kansas",
    "home": {
      "lat": 38.5,
      "lng": -98.0,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Chicago",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://www.kandrive.gov/",
    "deployed": false,
    "officialViewerUrl": "https://www.kandrive.gov/"
  },
  {
    "code": "KY",
    "name": "Kentucky",
    "slug": "kentucky",
    "home": {
      "lat": 37.5,
      "lng": -85.0,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/New_York",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://goky.ky.gov/",
    "deployed": false,
    "officialViewerUrl": "https://goky.ky.gov/"
  },
  {
    "code": "LA",
    "name": "Louisiana",
    "slug": "louisiana",
    "home": {
      "lat": 31.0,
      "lng": -92.0,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Chicago",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://www.511la.org/cctv",
    "deployed": false,
    "officialViewerUrl": "https://www.511la.org/cctv"
  },
  {
    "code": "ME",
    "name": "Maine",
    "slug": "maine",
    "home": {
      "lat": 45.0,
      "lng": -69.0,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/New_York",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://www.newengland511.org/cctv",
    "officialViewerUrl": "https://www.newengland511.org/cctv",
    "deployed": false
  },
  {
    "code": "MD",
    "name": "Maryland",
    "slug": "maryland",
    "home": {
      "lat": 39.0,
      "lng": -76.7,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/New_York",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://www.chart.maryland.gov/TrafficCameras/GetTrafficCameras",
    "officialViewerUrl": "https://www.chart.maryland.gov/TrafficCameras/GetTrafficCameras",
    "deployed": false
  },
  {
    "code": "MA",
    "name": "Massachusetts",
    "slug": "massachusetts",
    "home": {
      "lat": 42.2,
      "lng": -71.8,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/New_York",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://www.mass511.com/list/cameras",
    "officialViewerUrl": "https://www.mass511.com/list/cameras",
    "deployed": false
  },
  {
    "code": "MI",
    "name": "Michigan",
    "slug": "michigan",
    "home": {
      "lat": 44.0,
      "lng": -85.0,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Detroit",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://mdotjboss.state.mi.us/MiDrive/cameras?county=&route=",
    "deployed": false,
    "officialViewerUrl": "https://mdotjboss.state.mi.us/MiDrive/cameras?county=&route="
  },
  {
    "code": "MN",
    "name": "Minnesota",
    "slug": "minnesota",
    "home": {
      "lat": 46.0,
      "lng": -94.5,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Chicago",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://511mn.org/",
    "deployed": false,
    "officialViewerUrl": "https://511mn.org/"
  },
  {
    "code": "MS",
    "name": "Mississippi",
    "slug": "mississippi",
    "home": {
      "lat": 32.7,
      "lng": -89.7,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Chicago",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://www.mdottraffic.com/default.aspx?showMain=true",
    "deployed": false,
    "officialViewerUrl": "https://www.mdottraffic.com/default.aspx?showMain=true"
  },
  {
    "code": "MO",
    "name": "Missouri",
    "slug": "missouri",
    "home": {
      "lat": 38.5,
      "lng": -92.5,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Chicago",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://www.modot.org/closed-circuit-cameras",
    "deployed": false,
    "officialViewerUrl": "https://www.modot.org/closed-circuit-cameras"
  },
  {
    "code": "MT",
    "name": "Montana",
    "slug": "montana",
    "home": {
      "lat": 47.0,
      "lng": -110.0,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Denver",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://app.mdt.mt.gov/atms/public/cameras",
    "officialViewerUrl": "https://app.mdt.mt.gov/atms/public/cameras",
    "deployed": false
  },
  {
    "code": "NE",
    "name": "Nebraska",
    "slug": "nebraska",
    "home": {
      "lat": 41.5,
      "lng": -99.5,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Chicago",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://511.nebraska.gov/",
    "deployed": false,
    "officialViewerUrl": "https://511.nebraska.gov/"
  },
  {
    "code": "NV",
    "name": "Nevada",
    "slug": "nevada",
    "home": {
      "lat": 39.0,
      "lng": -117.0,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Los_Angeles",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://www.nvroads.com/",
    "officialViewerUrl": "https://www.nvroads.com/",
    "deployed": false
  },
  {
    "code": "NH",
    "name": "New Hampshire",
    "slug": "new-hampshire",
    "home": {
      "lat": 43.8,
      "lng": -71.6,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/New_York",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://www.newengland511.org/cctv",
    "officialViewerUrl": "https://www.newengland511.org/cctv",
    "deployed": false
  },
  {
    "code": "NJ",
    "name": "New Jersey",
    "slug": "new-jersey",
    "home": {
      "lat": 40.0,
      "lng": -74.5,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/New_York",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://511nj.org/",
    "officialViewerUrl": "https://511nj.org/",
    "deployed": false
  },
  {
    "code": "NM",
    "name": "New Mexico",
    "slug": "new-mexico",
    "home": {
      "lat": 34.5,
      "lng": -106.0,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Denver",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://www.nmroads.com/default.html",
    "officialViewerUrl": "https://www.nmroads.com/default.html",
    "deployed": false
  },
  {
    "code": "NY",
    "name": "New York",
    "slug": "new-york",
    "home": {
      "lat": 43.0,
      "lng": -75.5,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/New_York",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://www.511ny.org/cctv",
    "officialViewerUrl": "https://www.511ny.org/cctv",
    "deployed": false
  },
  {
    "code": "NC",
    "name": "North Carolina",
    "slug": "north-carolina",
    "home": {
      "lat": 35.6,
      "lng": -79.8,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/New_York",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://www.drivenc.gov/map",
    "officialViewerUrl": "https://www.drivenc.gov/map",
    "deployed": false
  },
  {
    "code": "ND",
    "name": "North Dakota",
    "slug": "north-dakota",
    "home": {
      "lat": 47.5,
      "lng": -100.5,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Chicago",
    "status": "restricted",
    "sourceName": "",
    "sourceUrl": "https://travel.dot.nd.gov/",
    "officialViewerUrl": "https://travel.dot.nd.gov/",
    "deployed": false
  },
  {
    "code": "OH",
    "name": "Ohio",
    "slug": "ohio",
    "home": {
      "lat": 40.3,
      "lng": -82.8,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/New_York",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://www.ohgo.com/",
    "deployed": false,
    "officialViewerUrl": "https://www.ohgo.com/"
  },
  {
    "code": "OK",
    "name": "Oklahoma",
    "slug": "oklahoma",
    "home": {
      "lat": 35.5,
      "lng": -97.5,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Chicago",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://oktraffic.org/",
    "deployed": false,
    "officialViewerUrl": "https://oktraffic.org/"
  },
  {
    "code": "OR",
    "name": "Oregon",
    "slug": "oregon",
    "home": {
      "lat": 44.0,
      "lng": -120.5,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Los_Angeles",
    "status": "ready",
    "sourceName": "ODOT TripCheck",
    "sourceUrl": "https://www.tripcheck.com/Pages/Custom-Cameras",
    "officialViewerUrl": "https://www.tripcheck.com/",
    "deployed": false,
    "minRefreshSeconds": 300
  },
  {
    "code": "PA",
    "name": "Pennsylvania",
    "slug": "pennsylvania",
    "home": {
      "lat": 41.0,
      "lng": -77.5,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/New_York",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://www.511pa.com/",
    "officialViewerUrl": "https://www.511pa.com/",
    "deployed": false
  },
  {
    "code": "RI",
    "name": "Rhode Island",
    "slug": "rhode-island",
    "home": {
      "lat": 41.7,
      "lng": -71.5,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/New_York",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://dot.ri.gov/travel/",
    "officialViewerUrl": "https://dot.ri.gov/travel/",
    "deployed": false
  },
  {
    "code": "SC",
    "name": "South Carolina",
    "slug": "south-carolina",
    "home": {
      "lat": 34.0,
      "lng": -81.0,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/New_York",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://www.511sc.org/",
    "officialViewerUrl": "https://www.511sc.org/",
    "deployed": false
  },
  {
    "code": "SD",
    "name": "South Dakota",
    "slug": "south-dakota",
    "home": {
      "lat": 44.5,
      "lng": -100.0,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Chicago",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://www.sd511.org/",
    "officialViewerUrl": "https://www.sd511.org/",
    "deployed": false
  },
  {
    "code": "TN",
    "name": "Tennessee",
    "slug": "tennessee",
    "home": {
      "lat": 35.8,
      "lng": -86.0,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Chicago",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://smartway.tn.gov/allcams?region=All+Regions",
    "deployed": false,
    "officialViewerUrl": "https://smartway.tn.gov/allcams?region=All+Regions"
  },
  {
    "code": "TX",
    "name": "Texas",
    "slug": "texas",
    "home": {
      "lat": 31.0,
      "lng": -99.0,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Chicago",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://www.txdot.gov/discover/live-traffic-cameras.html",
    "officialViewerUrl": "https://www.txdot.gov/discover/live-traffic-cameras.html",
    "deployed": false
  },
  {
    "code": "UT",
    "name": "Utah",
    "slug": "utah",
    "home": {
      "lat": 40.7705,
      "lng": -111.891,
      "zoom": 14,
      "count": 25
    },
    "timezone": "America/Denver",
    "status": "existing",
    "sourceName": "UDOT",
    "sourceUrl": "https://www.udottraffic.utah.gov/",
    "officialViewerUrl": "https://udottraffic.utah.gov/cctv",
    "deployed": true
  },
  {
    "code": "VT",
    "name": "Vermont",
    "slug": "vermont",
    "home": {
      "lat": 44.0,
      "lng": -72.7,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/New_York",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://www.newengland511.org/cctv",
    "officialViewerUrl": "https://www.newengland511.org/cctv",
    "deployed": false
  },
  {
    "code": "VA",
    "name": "Virginia",
    "slug": "virginia",
    "home": {
      "lat": 37.5,
      "lng": -79.0,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/New_York",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://511.vdot.virginia.gov/",
    "officialViewerUrl": "https://511.vdot.virginia.gov/",
    "deployed": false
  },
  {
    "code": "WA",
    "name": "Washington",
    "slug": "washington",
    "home": {
      "lat": 47.4,
      "lng": -120.7,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Los_Angeles",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://wsdot.com/travel/real-time/map/",
    "officialViewerUrl": "https://wsdot.com/travel/real-time/map/",
    "deployed": false
  },
  {
    "code": "WV",
    "name": "West Virginia",
    "slug": "west-virginia",
    "home": {
      "lat": 38.6,
      "lng": -80.6,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/New_York",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://wv511.org/CameraListing.aspx",
    "officialViewerUrl": "https://wv511.org/CameraListing.aspx",
    "deployed": false
  },
  {
    "code": "WI",
    "name": "Wisconsin",
    "slug": "wisconsin",
    "home": {
      "lat": 44.5,
      "lng": -89.5,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Chicago",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://511wi.gov/cctv",
    "deployed": false,
    "officialViewerUrl": "https://511wi.gov/cctv"
  },
  {
    "code": "WY",
    "name": "Wyoming",
    "slug": "wyoming",
    "home": {
      "lat": 43.0,
      "lng": -107.5,
      "zoom": 7,
      "count": 25
    },
    "timezone": "America/Denver",
    "status": "pending",
    "sourceName": "",
    "sourceUrl": "https://www.wyoroad.info/Highway/webcameras/webcameras.html",
    "officialViewerUrl": "https://www.wyoroad.info/Highway/webcameras/webcameras.html",
    "deployed": false
  }
];
  function get(value) {
    if (typeof value !== 'string') return null;
    const key = value.toLowerCase();
    return states.find(s => s.code.toLowerCase() === key || s.slug === key) || null;
  }
  function resolve(hostname, search) {
    const host = String(hostname || '').toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
    if (host.endsWith('.monitorit.app') && host !== 'www.monitorit.app') {
      return get(host.slice(0, -'.monitorit.app'.length));
    }
    // Query routing provides reviewable previews without claiming a DNS deployment.
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' ||
        host === 'monitorit.app' || host === 'www.monitorit.app' || host.endsWith('.vercel.app')) {
      const selected = new URLSearchParams(search || '').get('state');
      return selected ? get(selected) : get('UT');
    }
    return null;
  }
  return { states, get, resolve };
});
