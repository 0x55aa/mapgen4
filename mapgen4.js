/*
 * From http://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *      http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

const param       = require('./config');
const WebWorkify  = require('webworkify');
const MakeMesh    = require('./mesh');
const Map         = require('./map');
const Painting    = require('./painting');
const Render      = require('./render');


/** @typedef { import("./types").Mesh } Mesh */

/**
 * Starts the UI, once the mesh has been loaded in.
 *
 * @param {{mesh: Mesh, peaks_t: number[]}} _
 */
function main({mesh, peaks_t}) {
    let render = new Render.Renderer(mesh);

    const gparam = Render.param;
    if (document.location.hostname === 'localhost') {
        /* Only inject this locally because it slows things down */
        let G = new /** @type{any} */(window).dat.GUI();
        G.close();
        G.add(gparam, 'distance', 100, 1000);
        G.add(gparam, 'x', 0, 1000);
        G.add(gparam, 'y', 0, 1000);
        G.add(gparam.drape, 'light_angle_deg', 0, 360);
        G.add(gparam.drape, 'slope', 0, 5);
        G.add(gparam.drape, 'flat', 0, 5);
        G.add(gparam.drape, 'c', 0, 1);
        G.add(gparam.drape, 'd', 0, 40);
        G.add(gparam.drape, 'rotate_x_deg', 0, 90);
        G.add(gparam.drape, 'rotate_z_deg', -180, 180);
        G.add(gparam.drape, 'mountain_height', 0, 250);
        G.add(gparam.drape, 'outline_depth', 0, 2);
        G.add(gparam.drape, 'outline_strength', 0, 30);
        G.add(gparam.drape, 'outline_threshold', 0, 100);
        for (let c of G.__controllers) c.listen().onChange(redraw);
    }

    function redraw() {
        // TODO: this should go inside requestAnimationFrame, and it
        // shouldn't trigger multiple times. However, I can't do this
        // while a graphics buffer has been passed to the geometry
        // module. I don't understand *why* this is the case though,
        // as I thought render.updateMap() copied everything into GPU
        // buffers. There must be something doing this asynchronously.
        render.updateView();
    }

    Painting.screenToWorldCoords = (coords) => {
        let out = render.screenToWorld(coords);
        return [out[0] / 1000, out[1] / 1000];
    };

    Painting.onUpdate = () => {
        generate();
    };

    const worker = /** @type {Worker} */(WebWorkify(require('./worker.js')));
    let working = false;
    let elapsedTimeHistory = [];

    worker.addEventListener('message', event => {
        working = false;
        let {elapsed, numRiverTriangles, quad_elements_buffer, a_quad_em_buffer, a_river_xyuv_buffer} = event.data;
        elapsedTimeHistory.push(elapsed | 0);
        if (elapsedTimeHistory.length > 10) { elapsedTimeHistory.splice(0, 1); }
        document.getElementById('timing').innerText = `${elapsedTimeHistory.join(' ')} milliseconds`;
        render.quad_elements = new Int32Array(quad_elements_buffer);
        render.a_quad_em = new Float32Array(a_quad_em_buffer);
        render.a_river_xyuv = new Float32Array(a_river_xyuv_buffer);
        render.numRiverTriangles = numRiverTriangles;
        render.updateMap();
        redraw();
    });

    function generate() {
        if (!working) {
            working = true;
            worker.postMessage({
                constraints: {
                    size: Painting.size,
                    windAngleDeg: Painting.getWindAngleDeg(),
                    constraints: Painting.constraints,
                },
                quad_elements_buffer: render.quad_elements.buffer,
                a_quad_em_buffer: render.a_quad_em.buffer,
                a_river_xyuv_buffer: render.a_river_xyuv.buffer,
            }, [
                render.quad_elements.buffer,
                render.a_quad_em.buffer,
                render.a_river_xyuv.buffer,
            ]
                              );
        }
    }

    worker.postMessage({mesh, peaks_t, param});
    generate();
}

MakeMesh.makeMesh().then(main);

