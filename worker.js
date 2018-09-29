/*
 * From https://www.redblobgames.com/maps/mapgen4/
 * Copyright 2018 Red Blob Games <redblobgames@gmail.com>
 * License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>
 *
 * This module runs the worker thread that calculates the map data.
 */
'use strict';

const DualMesh = require('@redblobgames/dual-mesh');
const Map      = require('./map');
const Geometry = require('./geometry');

/**
 * @typedef { import("./types").Mesh } Mesh
 */

function Worker(self) {
    // This handler is for the initial message
    let handler = event => {
        const param = event.data.param;

        // NOTE: web worker messages only include the data; to
        // reconstruct the full object I call the constructor again
        // and then copy the data over
        const mesh = /** @type{Mesh} */(new DualMesh(event.data.mesh));
        Object.assign(mesh, event.data.mesh);
        
        const map = new Map(mesh, event.data.peaks_t, param);

        // This handler is for all subsequent messages
        handler = event => {
            let {constraints, quad_elements_buffer, a_quad_em_buffer, a_river_xyuv_buffer} = event.data;

            let start_time = performance.now();
            map.assignElevation(constraints);
            map.assignMoisture(constraints.windAngleDeg);
            map.assignRivers();
            Geometry.setMapGeometry(map, new Int32Array(quad_elements_buffer), new Float32Array(a_quad_em_buffer));
            let numRiverTriangles = Geometry.setRiverTextures(map, param.spacing, new Float32Array(a_river_xyuv_buffer));
            let elapsed = performance.now() - start_time;

            self.postMessage(
                {elapsed,
                 numRiverTriangles,
                 quad_elements_buffer,
                 a_quad_em_buffer,
                 a_river_xyuv_buffer,
                },
                [
                    quad_elements_buffer,
                    a_quad_em_buffer,
                    a_river_xyuv_buffer,
                ]
            );
        };
    };
        
    self.addEventListener('message', event => handler(event));
}

module.exports = Worker;
