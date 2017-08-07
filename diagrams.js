// From http://www.redblobgames.com/maps/mapgen2/
// Copyright 2017 Red Blob Games <redblobgames@gmail.com>
// License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>

'use strict';

const SEED = 123456789;
const TriangleMesh = require('@redblobgames/triangle-mesh');
const create_mesh = require('@redblobgames/triangle-mesh/create');
const SimplexNoise = require('simplex-noise');
const {mix, clamp, smoothstep, circumcenter} = require('./algorithms/util');
const water = require('./algorithms/water');

let noise = new SimplexNoise(makeRandFloat(SEED));
const mesh_30 = new TriangleMesh(create_mesh(30.0, makeRandFloat(SEED)));
const mesh_40 = new TriangleMesh(create_mesh(40.0, makeRandFloat(SEED)));
const mesh_50 = new TriangleMesh(create_mesh(50.0, makeRandFloat(SEED)));
const mesh_75 = new TriangleMesh(create_mesh(75.0, makeRandFloat(SEED)));

function fallback(value, or_else) {
    return (value !== undefined)? value : or_else;
}

function set_canvas_style(ctx, style, defaults) {
    ctx.globalAlpha = fallback(style.globalAlpha, fallback(defaults.globalAlpha, 1.0));
    ctx.lineWidth =   fallback(style.lineWidth,   fallback(defaults.lineWidth,   1.0));
    ctx.fillStyle =   fallback(style.fillStyle,   fallback(defaults.fillStyle,   "black"));
    ctx.strokeStyle = fallback(style.strokeStyle, fallback(defaults.strokeStyle, "black"));
}

let layers = {};

layers.triangle_edges = (style) => (ctx, mesh) => {
    set_canvas_style(ctx, style, {strokeStyle: "black", lineWidth: 1.0});
    for (let e = 0; e < mesh.num_solid_edges; e++) {
        let v0 = mesh.e_begin_v(e);
        let v1 = mesh.e_end_v(e);
        ctx.beginPath();
        ctx.moveTo(mesh.vertices[v0][0], mesh.vertices[v0][1]);
        ctx.lineTo(mesh.vertices[v1][0], mesh.vertices[v1][1]);
        ctx.stroke();
    }
};

layers.polygon_edges = (style) => (ctx, mesh) => {
    set_canvas_style(ctx, style, {strokeStyle: "white", lineWidth: 2.0});
    for (let e = 0; e < mesh.num_edges; e++) {
        let v0 = mesh.e_begin_v(e);
        let v1 = mesh.e_end_v(e);
        let t0 = TriangleMesh.e_to_t(e);
        let t1 = TriangleMesh.e_to_t(mesh.opposites[e]);
        if (t0 > t1) {
            ctx.beginPath();
            ctx.moveTo(mesh.centers[t0][0], mesh.centers[t0][1]);
            ctx.lineTo(mesh.centers[t1][0], mesh.centers[t1][1]);
            ctx.stroke();
        }
    }
};

layers.triangle_centers = (style) => (ctx, mesh) => {
    const radius = style.radius || 5;
    set_canvas_style(ctx, style, {fillStyle: "hsl(240,50%,50%)", strokeStyle: "white", lineWidth: 1.0});
    for (let t = 0; t < mesh.num_solid_triangles; t++) {
        ctx.beginPath();
        ctx.arc(mesh.centers[t][0], mesh.centers[t][1], radius, 0, 2*Math.PI);
        ctx.stroke();
        ctx.fill();
    }
};

layers.polygon_centers = (style) => (ctx, mesh) => {
    const radius = style.radius || 5;
    set_canvas_style(ctx, style, {fillStyle: "hsl(0,50%,50%)", strokeStyle: "hsl(0,0%,75%)", lineWidth: 3.0});
    for (let v = 0; v < mesh.num_solid_vertices; v++) {
        ctx.beginPath();
        ctx.arc(mesh.vertices[v][0], mesh.vertices[v][1], mesh.v_boundary(v) ? radius/2 : radius, 0, 2*Math.PI);
        ctx.stroke();
        ctx.fill();
    }
};

/* coloring should be a function from v (polygon) to color string */
layers.polygon_colors = (style, coloring) => (ctx, mesh) => {
    const radius = style.radius || 5;
    let t_out = [];
    set_canvas_style(ctx, style, {});
    for (let v = 0; v < mesh.num_solid_vertices; v++) {
        mesh.v_circulate_t(t_out, v);
        ctx.fillStyle = coloring(v);
        ctx.beginPath();
        ctx.moveTo(mesh.centers[t_out[0]][0], mesh.centers[t_out[0]][1]);
        for (let i = 1; i < t_out.length; i++) {
            ctx.lineTo(mesh.centers[t_out[i]][0], mesh.centers[t_out[i]][1]);
        }
        ctx.fill();
    }
};

function diagram(canvas, mesh, options, layers) {
    const scale = fallback(options.scale, 1.0);
    let ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(canvas.width/1000, canvas.height/1000);
    ctx.clearRect(0, 0, 1000, 1000);
    ctx.translate(500, 500); ctx.scale(scale, scale); ctx.translate(-500, -500);
    ctx.fillStyle = "hsl(60, 5%, 75%)";
    ctx.fillRect(0, 0, 1000, 1000);

    for (let layer of layers) {
        layer(ctx, mesh);
    }
    
    ctx.restore();
}

function create_circumcenter_mesh(mesh, mixture) {
    let centers = [], v_out = [];
    for (var t = 0; t < mesh.num_solid_triangles; t++) {
        mesh.t_circulate_v(v_out, t);
        let a = mesh.vertices[v_out[0]],
            b = mesh.vertices[v_out[1]],
            c = mesh.vertices[v_out[2]];
        let center = circumcenter(a, b, c);
        centers.push([mix(mesh.centers[t][0], center[0], mixture),
                      mix(mesh.centers[t][1], center[1], mixture)]);
    }
    for (; t < mesh.num_triangles; t++) {
        centers.push(mesh.centers[t]);
    }
    let new_mesh = new TriangleMesh(mesh);
    new_mesh.centers = centers;
    return new_mesh;
}


let diagram_mesh_construction = new Vue({
    el: "#diagram-mesh-construction",
    data: {
        time: 0.0,
        time_goal: 0.0,
        centroid_circumcenter_mix: 0.0,
        mesh: Object.freeze(mesh_75)
    },
    directives: {
        draw: function(canvas, {value: {mesh, time, centroid_circumcenter_mix}}) {
            diagram(canvas,
                    create_circumcenter_mesh(mesh, centroid_circumcenter_mix),
                    {scale: 0.9},
                    [layers.triangle_edges({globalAlpha: smoothstep(0.1, 1.0, time) - 0.75 * smoothstep(1.1, 3.0, time), lineWidth: 3.0}),
                     layers.polygon_edges({globalAlpha: smoothstep(2.1, 3.0, time), strokeStyle: "hsl(0,0%,90%)", lineWidth: 4.0}),
                     layers.polygon_centers({radius: 7}),
                     layers.triangle_centers({globalAlpha: smoothstep(1.1, 2.0, time)})]);
        }
    }
});

setInterval(() => {
    const speed = 1.0;
    const dt = 20/1000;
    let step = clamp(speed * (diagram_mesh_construction.time_goal - diagram_mesh_construction.time), -dt, +dt);
    diagram_mesh_construction.time += step;
}, 20);


new Vue({
    el: "#diagram-water-assignment",
    data: {
        round: 0.5,
        inflate: 0.5,
        mesh: Object.freeze(mesh_30)
    },
    computed: {
        v_water: function() {
            return water.assign_v_water(this.mesh, noise,
                                        {round: this.round, inflate: this.inflate});
        },
        v_ocean: function() {
            console.log("computing v_ocean");
            return water.assign_v_ocean(this.mesh, this.v_water);
        },
        counts: function() {
            let ocean = 0, lake = 0;
            for (let v = 0; v < this.mesh.num_vertices; v++) {
                if (this.v_water[v]) {
                    if (this.v_ocean[v]) { ocean++; }
                    else                 { lake++; }
                }
            }
            return {ocean, lake};
        }
    },
    directives: {
        draw: function(canvas, {value: {mesh, v_water, v_ocean}}) {
            diagram(canvas, mesh, {},
                    [layers.polygon_colors({}, (v) => v_ocean[v]? "hsl(230,30%,30%)" : v_water[v]? "hsl(200,30%,50%)" : "hsl(30,15%,60%)"),
                     layers.polygon_edges({strokeStyle: "black"}),
                     layers.polygon_centers({radius: 1.5, fillStyle: "black", strokeStyle: "black"})]);
        }
    }
});
