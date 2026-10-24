# Third-party materials

The root MIT license covers original code and original documentation contributed to this repository. It does not override the licenses or terms of third-party material, including material reproduced in data files or documentation. Preserve source attributions when redistributing data.

| Material | Location and terms |
| --- | --- |
| OpenStreetMap data | `public/map/`, live map and route results: © OpenStreetMap contributors, [ODbL 1.0](https://www.openstreetmap.org/copyright). Derived databases retain applicable ODbL obligations. |
| Overture Maps Places | `public/map/states/`: attribution to Overture Maps Foundation; CDLA Permissive 2.0, with OSM-derived records subject to ODbL. See the source metadata and [map notes](docs/MAP_DATA.md). |
| US Census and NCES data | `public/places/`: federal source datasets and their documentation are identified in [place notes](docs/PLACES_DATA.md). These datasets are not licensed by this project's MIT grant. |
| Laws, policies and source excerpts | `data/rules/`, `data/mods/`, `data/overlay.json`: source URLs and research dates are retained. Applicable source terms remain in force; MIT grants no rights to third-party text. |
| Manufacturer specifications and photos | `data/bikes/` and pilot manifests: manufacturer facts, quotations and links retain their source terms. Catalog photos load from the manufacturer; pilot source photos are not committed. See [catalog notes](docs/BIKE_FINDER.md) and [pilot](PILOT.md). |
| Models and OCR resources | Downloaded by the browser, not redistributed in this repository. Follow each upstream model/resource license, including the model card and dependency notices. |
| Software dependencies | Each package retains its own license in its distributed package. In particular, react-leaflet uses Hippocratic License 2.1; the project's MIT license does not replace it. |

Map tile, geocoding, routing, model-hosting and product-page services also have usage policies independent of data licenses. A public source repository is not a grant of unlimited service capacity. See [deployment notes](docs/DEPLOYMENT.md).
