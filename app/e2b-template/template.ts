import { Template } from "e2b"

/**
 * E2B sandbox template for the Hawaii policy assistant's `execute_python` tool.
 *
 * Extends E2B's public Code Interpreter template (pandas, numpy, scipy,
 * requests, matplotlib, ...) with the geospatial stack so the agent can do
 * real polygon overlays and area calculations instead of hand-rolled geometry,
 * and with PDF readers so it can read reports that agencies publish only as PDF
 * (e.g. the DHS Databook).
 * See https://docs.e2b.dev/quickstart/install-custom-packages
 */
// Pinned to the versions verified by the first successful build (Python 3.13).
export const GEO_PACKAGES = [
  "geopandas==1.2.0",
  "shapely==2.2.0",
  "pyproj==3.8.0",
  "pyogrio==0.13.0",
]

// PDF text (pypdf) and table (pdfplumber) extraction. Versions current on PyPI
// as of 2026-11-13.
export const PDF_PACKAGES = ["pypdf==7.1.0", "pdfplumber==0.11.10"]

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
  // Installed after the geo steps so those cached build layers are reused.
  .pipInstall(PDF_PACKAGES)
  // Fail the build if a PDF library cannot be imported, or if installing them
  // broke plotting (pdfplumber pulls in a newer Pillow, which matplotlib uses).
  .runCmd(
    'python3 -c "import pypdf, pdfplumber, matplotlib.pyplot; ' +
      "print('pypdf', pypdf.__version__, '| pdfplumber', pdfplumber.__version__, " +
      "'| matplotlib', matplotlib.__version__)\""
  )
