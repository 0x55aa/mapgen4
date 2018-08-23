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

/* global dat */

const SimplexNoise = require('simplex-noise');
const DualMesh =     require('@redblobgames/dual-mesh');
const MeshBuilder =  require('@redblobgames/dual-mesh/create');
const Render =       require('./render');
const {makeRandInt, makeRandFloat} = require('@redblobgames/prng');


let param = {
    seed: 42,   // 102, 181, 184, 185, 187, 505, 507, 2033
    spacing: 5,
    canvasSize: 2000,
    softwareWater: false,
};

(function readSeedFromUrl() {
    let match = (window.location.search || "").match(/\?seed=([0-9]+)/);
    if (match) {
        param.seed = parseFloat(match[1]) | 0;
    }
})();

let PEAKS = (() => {
    const spacing = 0.07;
    let result = [];
    let offset = 0;
    for (let y = -0.9; y <= 0.9; y += spacing) {
        offset = offset > 0? 0 : spacing/2;
        for (let x = -0.9 + offset; x <= 0.9; x += spacing) {
            result.push({
                x: x + (Math.random() - Math.random()) * spacing,
                y: y + (Math.random() - Math.random()) * spacing,
                zm: 1.0 + (Math.random() - Math.random()) * 0.2,
                zh: 1.0 + (Math.random() - Math.random()) * 0.2,
                wm: 20 + 3 * y,
                wh: 40 + 10 * y,
            });
        }
    }
    return result;
})();

function elevation(noise, x, y) {
    let dx = (x-500)/500, dy = (y-500)/500;
    let base = noise.noise2D(dx, dy);
    base = (0.75 * base
             + 0.5 * noise.noise2D(dx*2 + 5, dy*2 + 5)
             + 0.125 * noise.noise2D(dx*4 + 7, dy*4 + 7)
             + 0.0625 * noise.noise2D(dx*8 + 9, dy*8 + 9));

    function mountain(x, y, w) {
        let d = Math.sqrt((x - dx) * (x - dx) + (y - dy) * (y - dy));
        return 1 - w * d;
    }
    function hill(x, y, w) {
        let d2 = (x - dx) * (x - dx) + (y - dy) * (y - dy);
        return Math.max(0, Math.pow(Math.exp(-d2*3000), 0.5) - 0.3);
    }
    let e = base;
    let eh = 0;
    let em = 0;
    if (base > 0) {
        for (let {x, y, zm, zh, wm, wh} of PEAKS) {
            em = Math.max(em, zm * mountain(x, y, wm));
            eh = Math.max(eh, zh * hill(x, y, wh));
        }

        // now use base to decide how much of eh, em to mix in. At base = 0 we mix in none of it. At base = 0.5 we mix in hills. At base = 1.0 we mix in mountains.
        let w0 = 2,
            wm = 2 * base * base,
            wh = 0.5 * (0.5 - Math.abs(0.5 - base));
        e = (w0 * base + wh * eh + wm * em) / (w0 + wh + wm);
    }
    
    return e;
    /*
    // base = (1.0 - Math.abs(base) * 2.0) * Math.pow(Math.abs(noise.noise2D(1.5*dx + 10, 1.5*dy + 10)), 0.125);
    // TODO: use one noise field to calculate land/water and another to calculate elevation
    // TODO: calculate distance from coast (multiplied by param.spacing)
    // TODO: mix(distance_from_coast / 20, basenoise, smoothstep(0, 20, distance_from_coast))
    let e = (0.5 * base
             + 0.25 * noise.noise2D(dx*2 + 5, dy*2 + 5)
             + 0.125 * noise.noise2D(dx*4 + 7, dy*4 + 7)
             + 0.0625 * noise.noise2D(dx*8 + 9, dy*8 + 9));

    let step = (base < 0.5)? 0 : (base > 0.7)? 1 : (base - 0.5)/0.2;
    e += step * 0.5 * (Math.abs(noise.noise2D(dx*3 - 3, dy*3 - 3)) * base) * Math.abs(noise.noise2D(dx*32 + 9, dy*32 + 9)); // bumpier mountains
    
    if (e < -1.0) { e = -1.0; }
    if (e > +1.0) { e = +1.0; }
    return e;
*/
}


class Map {
    constructor (mesh) {
        console.time('map-alloc');
        this.mesh = mesh;
        this.noise = new SimplexNoise(makeRandFloat(param.seed));
        this.t_elevation = new Float32Array(mesh.numTriangles);
        this.r_elevation = new Float32Array(mesh.numRegions);
        this.r_moisture = new Float32Array(mesh.numRegions);
        this.r_water = new Int8Array(mesh.numRegions);
        this.r_ocean = new Int8Array(mesh.numRegions);
        this.t_downslope_s = new Int32Array(mesh.numTriangles);
        this.order_t = new Int32Array(mesh.numTriangles);
        this.t_flow = new Float32Array(mesh.numTriangles);
        this.s_flow = new Float32Array(mesh.numSides);
        this.seeds_t = [];
        console.timeEnd('map-alloc');
    }

    assignElevation() {
        let {mesh, noise, t_elevation, r_elevation, r_moisture, r_water, r_ocean, seeds_t} = this;
        console.time('map-elevation-1');
        seeds_t.splice(0);
        for (let t = 0; t < mesh.numTriangles; t++) {
            let e = elevation(noise, mesh.t_x(t), mesh.t_y(t), t);
            t_elevation[t] = e;
            if (e < 0 && mesh.t_ghost(t)) { seeds_t.push(t); }
        }
        console.timeEnd('map-elevation-1');
        console.time('map-elevation-2');
        let out_t = [];
        for (let r = 0; r < mesh.numRegions; r++) {
            let e = 0, water = false;
            mesh.r_circulate_t(out_t, r);
            for (let t of out_t) { e += t_elevation[t]; water = water || t_elevation[t] < 0.0; }
            e /= out_t.length;
            if (water && e >= 0) { e = -0.001; }
            r_elevation[r] = e;
            r_moisture[r] = 0.8-Math.sqrt(Math.abs(e));
            r_water[r] = e < 0;
            r_ocean[r] = e < 0;
        }
        console.timeEnd('map-elevation-2');
    }

    assignRivers() {
        let {mesh, seeds_t, t_elevation, t_downslope_s, order_t, t_flow, s_flow} = this;
        console.time('map-rivers-1');
        biased_search(mesh, seeds_t, t_elevation, t_downslope_s, order_t);
        console.timeEnd('map-rivers-1');
        console.time('map-rivers-2');
        assign_flow(mesh, order_t, t_elevation, t_downslope_s, t_flow, s_flow);
        console.timeEnd('map-rivers-2');
    }
        
}


function biased_search(mesh, seeds_t, t_priority, /* out */ t_downflow_s, /* out */ order_t) {
    let out_s = [];
    t_downflow_s.fill(-999);
    seeds_t.forEach(t => { t_downflow_s[t] = -1; });
    order_t.set(seeds_t);
    for (let queue_in = seeds_t.length, queue_out = 0; queue_out < mesh.numTriangles; queue_out++) {
        if (queue_out >= seeds_t.length) {
            // Shuffle some elements of the queue to prefer values with lower t_priority.
            // Higher constants make it evaluate more elements, and rivers will meander less,
            // but also follow the contours more closely, which should result in fewer canyons.
            // TODO: try a threshold on whether to swap (should allow more meandering in valleys but less in mountains)
            // TODO: this step is fragile and may behave badly when updating small parts of the map
            let pivot_step = Math.ceil((queue_in-queue_out) / 5);
            for (let pivot = queue_in - 1; pivot > queue_out; pivot = pivot - pivot_step) {
                if (t_priority[order_t[pivot]] < t_priority[order_t[queue_out]]) {
                    let swap = order_t[pivot];
                    order_t[pivot] = order_t[queue_out];
                    order_t[queue_out] = swap;
                }
            }
        }
        
        let current_t = order_t[queue_out];
        mesh.t_circulate_s(out_s, current_t);
        for (let s of out_s) {
            let neighbor_t = mesh.s_outer_t(s); // uphill from current_t
            if (t_downflow_s[neighbor_t] === -999) {
                t_downflow_s[neighbor_t] = mesh.s_opposite_s(s);
                order_t[queue_in++] = neighbor_t;
            }
        }
    }
    // order_t is the visit pre-order, so roots of the tree always get
    // visited before leaves; we can use this in reverse to visit
    // leaves before roots
}


function assign_flow(mesh, order_t, t_elevation, t_downflow_s, /* out */ t_flow, /* out */ s_flow) {
    for (let t = 0; t < mesh.numTriangles; t++) {
        if (t_elevation[t] > 0) {
            t_flow[t] = 1;
        }
    }
    for (let i = order_t.length-1; i >= 0; i--) {
        // t1 is the tributary and t2 is the trunk
        let t1 = order_t[i];
        let s = t_downflow_s[t1];
        let t2 = mesh.s_outer_t(s);
        if (s >= 0 && t_elevation[t2] > 0) {
            t_flow[t2] += t_flow[t1];
            s_flow[s] += t_flow[t1];
            if (t_elevation[t2] > t_elevation[t1]) {
                t_elevation[t2] = t_elevation[t1];
            }
        }
    }
}


function jitteredHexagonGrid(spacing, discardFraction, randFloat) {
    const dr = spacing/1.5;
    let points = [];
    let offset = 0;
    for (let y = spacing/2; y < 1000-spacing/2; y += spacing * 3/4) {
        offset = (offset === 0)? spacing/2 : 0;
        for (let x = offset + spacing/2; x < 1000-spacing/2; x += spacing) {
            if (randFloat() < discardFraction) continue;
            let r = dr * Math.sqrt(Math.abs(randFloat()));
            let a = Math.PI * randFloat();
            let dx = r * Math.cos(a);
            let dy = r * Math.sin(a);
            points.push([x + dx, y + dy]);
        }
    }
    return points;
}


function draw() {
    let meshb = new MeshBuilder({boundarySpacing: param.spacing * 1.5});
    console.time('points');
    meshb.addPoints(jitteredHexagonGrid(1.5 * param.spacing * Math.sqrt(1 - 0.3), 0.3, makeRandFloat(12345)));
    console.timeEnd('points');
    
    console.time('mesh-init');
    let mesh = meshb.create(true);
    console.timeEnd('mesh-init');

    console.time('make-mesh-static');
    let render = new Render.Renderer(mesh);
    console.timeEnd('make-mesh-static');
    
    let map = new Map(mesh);

    console.log(`triangles = ${mesh.numTriangles} regions = ${mesh.numRegions}`);

    map.assignElevation();
    map.assignRivers();
    
    render.updateMap(map, param.spacing);
    render.updateView();

    const gparam = Render.param;
    let G = new dat.GUI();
    G.add(gparam, 'exponent', 1, 10);
    G.add(gparam, 'distance', 100, 1000);
    G.add(gparam, 'x', 0, 1000);
    G.add(gparam, 'y', 0, 1000);
    G.add(gparam.drape, 'light_angle_deg', 0, 360);
    G.add(gparam.drape, 'slope', 0, 5);
    G.add(gparam.drape, 'flat', 0, 5);
    G.add(gparam.drape, 'c', 0, 1);
    G.add(gparam.drape, 'd', 0, 40);
    G.add(gparam.drape, 'mix', 0, 2);
    G.add(gparam.drape, 'rotate_x_deg', -360, 360);
    G.add(gparam.drape, 'rotate_z_deg', -360, 360);
    G.add(gparam.drape, 'scale_z', 0, 2);
    G.add(gparam.drape, 'outline_depth', 0, 5);
    G.add(gparam.drape, 'outline_strength', 0, 30);
    G.add(gparam.drape, 'outline_threshold', 0, 100);
    for (let c of G.__controllers) c.listen().onChange(() => render.updateView());
    
}

function setUpImageDrop() {
    let dropbox = document.getElementById('drop-target');
    dropbox.addEventListener('dragenter', handleDragEnter, false);
    dropbox.addEventListener('dragover', handleDragOver, false);
    dropbox.addEventListener('dragleave', handleDragLeave, false);
    dropbox.addEventListener('drop', handleDrop, false);
    function handleDragEnter(e) {
        e.stopPropagation();
        e.preventDefault();
        let item = e.dataTransfer.items[0];
        dropbox.className = (item.kind === 'file' && item.type.startsWith("image/")) ? "dragging-good" : "dragging-bad";
    }
    function handleDragOver(e) {
        e.stopPropagation();
        e.preventDefault();
    }
    function handleDragLeave(e) {
        e.stopPropagation();
        e.preventDefault();
        dropbox.className = "";
    }
    function handleDrop(e) {
        e.stopPropagation();
        e.preventDefault();
        dropbox.className = "";

        let item = e.dataTransfer.items[0];
        if (item.kind != 'file') {
            console.log("Not a file:", item.kind);
            return;
        }
        if (!item.type.startsWith("image/")) {
            console.log("Not an image file:", item.type);
            return;
        }
        let noise = new SimplexNoise(makeRandFloat(param.seed));
        let reader = new FileReader();
        dropbox.className = "waiting";
        reader.onload = function(e) {
            dropbox.src = e.target.result;
            dropbox.onload = () => {
                let canvas = document.createElement('canvas');
                let w = canvas.width = dropbox.naturalWidth || dropbox.width;
                let h = canvas.height = dropbox.naturalHeight || dropbox.height;
                let ctx = canvas.getContext('2d');
                ctx.drawImage(dropbox, 0, 0);

                let rgba = ctx.getImageData(0, 0, w, h).data;
                function getPixel(x, y) { // where x,y between 0.0 and 1.0
                    let ix = (x * w) | 0;
                    if (ix < 0) { ix = 0; } else if (ix >= w) { ix = w-1; }
                    let iy = (y * h) | 0;
                    if (iy < 0) { iy = 0; } else if (iy >= h) { iy = h-1; }
                    
                    let i = 4 * (iy * w + ix);
                    let r = rgba[i], g = rgba[i+1], b = rgba[i+2];
                    return [r, g, b];
                }

                elevation = (_, x, y) => {
                    let pixel = getPixel(x/1000, y/1000);
                    let gray = pixel[1];
                    if (x < 5 && y < 5) { console.log('elevation', x, y, gray); }
                    if (pixel[2] > gray) {
                        // water
                        return elevationNoise(noise, -0.1, x*1000, y*1000);
                    } else {
                        // land
                        return Math.max(1/256, elevationNoise(noise, (gray/255)**2, x*1000, y*1000));
                    }
                };

                draw();
                dropbox.className = "";
            };
        };
        reader.readAsDataURL(e.dataTransfer.files[0]);
    }
}
setUpImageDrop();


draw();
