// From http://www.redblobgames.com/maps/mapgen2/
// Copyright 2017 Red Blob Games <redblobgames@gmail.com>
// License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>

'use strict';

const TriangleMesh = require('@redblobgames/triangle-mesh');
const create_mesh = require('@redblobgames/triangle-mesh/create');

const mesh_75 = new TriangleMesh(create_mesh(75.0));

function set_canvas_style(ctx, style, defaults) {
    ctx.globalAlpha = style.globalAlpha || defaults.globalAlpha || 1.0;
    ctx.fillStyle = style.fillStyle || defaults.fillStyle || "black";
    ctx.strokeStyle = style.strokeStyle || defaults.strokeStyle || "black";
    ctx.lineWidth = style.lineWidth || defaults.lineWidth || 1.0;
}

let layers = {};

layers.triangle_edges = (style) => (ctx, mesh) => {
    set_canvas_style(ctx, style, {strokeStyle: "black", lineWidth: 1.0});
    for (let e = 0; e < mesh.num_solid_edges; e++) {
        let v0 = mesh.e_to_begin_v(e);
        let v1 = mesh.e_to_end_v(e);
        ctx.beginPath();
        ctx.moveTo(mesh.vertices[v0][0], mesh.vertices[v0][1]);
        ctx.lineTo(mesh.vertices[v1][0], mesh.vertices[v1][1]);
        ctx.stroke();
    }
};

layers.polygon_edges = (style) => (ctx, mesh) => {
    set_canvas_style(ctx, style, {strokeStyle: "white", lineWidth: 2.0});
    for (let e = 0; e < mesh.num_edges; e++) {
        let v0 = mesh.e_to_begin_v(e);
        let v1 = mesh.e_to_end_v(e);
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
    const radius = style.radius || 4;
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
        ctx.arc(mesh.vertices[v][0], mesh.vertices[v][1], radius, 0, 2*Math.PI);
        ctx.stroke();
        ctx.fill();
    }
};

function diagram(canvas, mesh, layers) {
    let ctx = canvas.getContext('2d');
    ctx.save();
    ctx.scale(canvas.width/1000, canvas.height/1000);
    ctx.clearRect(0, 0, 1000, 1000);
    ctx.translate(50, 50); ctx.scale(0.9, 0.9);
    ctx.fillStyle = "hsl(0, 0%, 75%)";
    ctx.fillRect(0, 0, 1000, 1000);

    for (let layer of layers) {
        layer(ctx, mesh);
    }
    
    ctx.restore();
}


function mix(a, b, t) {
    return a * (1.0-t) + b * t;
}

function circumcenter(a, b, c) {
    // https://en.wikipedia.org/wiki/Circumscribed_circle#Circumcenter_coordinates
    let ad = a[0]*a[0] + a[1]*a[1],
        bd = b[0]*b[0] + b[1]*b[1],
        cd = c[0]*c[0] + c[1]*c[1];
    let D = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    let Ux = 1/D * (ad * (b[1] - c[1]) + bd * (c[1] - a[1]) + cd * (a[1] - b[1]));
    let Uy = 1/D * (ad * (c[0] - b[0]) + bd * (a[0] - c[0]) + cd * (b[0] - a[0]));
    return [Ux, Uy];
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


new Vue({
    el: "#diagram-polygon-centers",
    data: {
        mesh: Object.freeze(mesh_75)
    },
    directives: {
        draw: function(canvas, binding) {
            diagram(canvas, binding.value.mesh,
                    [layers.polygon_centers({})]);
        }
    }
});

new Vue({
    el: "#diagram-delaunay",
    data: {
        mesh: Object.freeze(mesh_75)
    },
    directives: {
        draw: function(canvas, binding) {
            diagram(canvas, binding.value.mesh,
                    [layers.triangle_edges({}), layers.polygon_centers({})]);
        }
    }
});

new Vue({
    el: "#diagram-triangle-centers",
    data: {
        param: 0.0
    },
    computed: {
        mesh: function() { return Object.freeze(create_circumcenter_mesh(mesh_75, parseFloat(this.param))); }
    },
    directives: {
        draw: function(canvas, binding) {
            diagram(canvas, binding.value.mesh,
                    [layers.triangle_edges({}),
                     layers.polygon_centers({}),
                     layers.triangle_centers({})]);
        }
    }
});

new Vue({
    el: "#diagram-dual-mesh",
    data: {
        param: 0.0
    },
    computed: {
        mesh: function() { return Object.freeze(create_circumcenter_mesh(mesh_75, parseFloat(this.param))); }
    },
    directives: {
        draw: function(canvas, binding) {
            diagram(canvas, binding.value.mesh,
                    [layers.triangle_edges({}),
                     layers.polygon_edges({}),
                     layers.polygon_centers({}),
                     layers.triangle_centers({})]);
        }
    }
});
