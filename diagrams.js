// From http://www.redblobgames.com/maps/mapgen2/
// Copyright 2017 Red Blob Games <redblobgames@gmail.com>
// License: Apache v2.0 <http://www.apache.org/licenses/LICENSE-2.0.html>

const TriangleMesh = require('@redblobgames/triangle-mesh');
const create_mesh = require('@redblobgames/triangle-mesh/create');

let mesh = new TriangleMesh(create_mesh(50.0));

new Vue({
    el: "#test",
    data: {
        param: 50,
        mesh: Object.freeze(mesh)
    },
    directives: {
        draw: function(canvas, binding) {
            const radius = 4;
            let ctx = canvas.getContext('2d');
            ctx.save();
            ctx.scale(canvas.width/1000, canvas.height/1000);
            ctx.fillStyle = "hsl(0, 0%, 80%)";
            ctx.fillRect(0, 0, 1000, 1000);
            ctx.strokeStyle = "black";
            ctx.lineWidth = 1.5;
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
            ctx.fillStyle = "red";
            for (let v = 0; v < mesh.num_solid_vertices; v++) {
                ctx.beginPath();
                ctx.arc(mesh.vertices[v][0], mesh.vertices[v][1], radius, 0, 2*Math.PI);
                ctx.fill();
            }
            ctx.restore();
        }
    }
});

