# Asset credits

## Poly Haven (CC0)

Textures, sky and scanned models come from [Poly Haven](https://polyhaven.com) and are in the
public domain. No attribution is required; they are listed so the sources can be found again.

| Used for | Poly Haven asset |
| --- | --- |
| `textures/sand` | coast_sand_01 |
| `textures/rock` | rock_face_03 |
| `textures/wood` | weathered_planks |
| `sky/night.jpg` | qwantani_dusk_2_puresky |
| `models/dutch_ship_medium.glb` | dutch_ship_medium |
| `models/namaqualand_boulder_03.glb` | namaqualand_boulder_03 |
| `models/rock_09.glb` | rock_09 |
| `models/wooden_crate_01.glb` | wooden_crate_01 |
| `models/wooden_barrels_01.glb` | wooden_barrels_01 |
| `models/dry_branches_medium_01.glb` | dry_branches_medium_01 |

`python3 tools/fetch-assets.py` downloads the textures and sky. `python3 tools/fetch-assets.py models`
then `bash tools/optimize-models.sh` downloads the models and shrinks them into the `.glb` files here.

## WebXR Input Profiles (MIT)

`hands/left.glb` and `hands/right.glb` are the generic hand models from
[@webxr-input-profiles/assets](https://github.com/immersive-web/webxr-input-profiles).

Copyright (c) 2019 Amazon. Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the "Software"), to deal in the Software
without restriction, including without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions: The above copyright notice and
this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
