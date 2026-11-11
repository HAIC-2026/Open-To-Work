import { Template } from "e2b"

/**
 * E2B sandbox template for the Hawaii policy assistant's `execute_python` tool.
 *
 * Extends E2B's public Code Interpreter template (pandas, numpy, scipy,
 * requests, matplotlib, ...) with the geospatial stack so the agent can do
 * real polygon overlays and area calculations instead of hand-rolled geometry.
 * See https://docs.e2b.dev/quickstart/install-custom-packages
 */
// Pinned to the versions verified by the first successful build (Python 3.13).
export const GEO_PACKAGES = [
  "geopandas==1.2.0",
  "shapely==2.2.0",
  "pyproj==3.8.0",
  "pyogrio==0.13.0",
]

export const template = Template()
  .fromTemplate("code-interpreter-v1")
  .pipInstall(GEO_PACKAGES)
  // Fail the build if any geo library cannot be imported (e.g. missing wheel).
  .runCmd(
    'python3 -c "import geopandas, shapely, pyproj, pyogrio; ' +
      "print('geopandas', geopandas.__version__, '| shapely', shapely.__version__, " +
      "'| pyproj', pyproj.__version__, '| pyogrio', pyogrio.__version__, " +
      "'| GDAL', pyogrio.__gdal_version_string__)\""
  )
