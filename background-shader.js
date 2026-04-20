import * as THREE from 'three';
import GUI from 'lil-gui';

// 1. Scene Setup
const canvas = document.getElementById('bg-canvas');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 1;

const renderer = new THREE.WebGLRenderer({ 
    canvas: canvas,
    antialias: true,
    alpha: true 
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// 2. Shader Uniforms
const uniforms = {
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uTime: { value: 0.0 },
    
    uDispersion: { value: 0.91 },
    uRefraction: { value: 0.7 },
    uScale: { value: 1.7 },
    uSpeed: { value: 0.36 },
    uSharpness: { value: 1.2 },
    
    uDeformation: { value: 0 }, 
    uBrightness: { value: 0.65 },
    uColorTint: { value: new THREE.Color('#ffffff') },
    
    uFilmGrain: { value: 0.04 }
};

// 3. Shader Material
const material = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: `
        void main() {
            gl_Position = vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform vec2 uResolution;
        uniform float uTime;
        
        uniform float uDispersion;
        uniform float uRefraction;
        uniform float uScale;
        uniform float uSpeed;
        uniform float uSharpness;
        uniform float uDeformation;
        uniform float uBrightness;
        uniform vec3 uColorTint;
        uniform float uFilmGrain;

        float plane(vec2 p, float angle, float phase) {
            float d = dot(p, vec2(cos(angle), sin(angle)));
            float val = sin(d + phase) * 0.5 + 0.5;
            return pow(val, uSharpness);
        }

        float hash13(vec3 p3) {
            p3  = fract(p3 * .1031);
            p3 += dot(p3, p3.zyx + 31.32);
            return fract((p3.x + p3.y) * p3.z);
        }

        float structure(vec2 p, float time) {
            float v = 0.0;
            v += plane(p, 0.5, time * 1.0);
            v += plane(p, 2.1, time * 0.7);
            v += plane(p, -0.8, -time * 1.2);
            v += plane(p, 4.0, time * 0.5);
            return v / 4.0; 
        }

        void main() {
            vec2 uv = gl_FragCoord.xy / uResolution.xy;
            vec2 p = (uv - 0.5) * vec2(uResolution.x/uResolution.y, 1.0) * uScale;
            
            float t = uTime * uSpeed;
            
            float r = length(p);
            float theta = atan(p.y, p.x);
            
            theta += uDeformation * exp(-r * 2.0) * 1.5; 
            p = vec2(cos(theta), sin(theta)) * r;
            
            p.x += sin(p.y * 3.0 + t) * (uDeformation * 0.15);
            p.y += cos(p.x * 3.0 - t) * (uDeformation * 0.15);
            
            float eps = 0.01;
            float base = structure(p, t);
            float dx = structure(p + vec2(eps, 0.0), t) - base;
            float dy = structure(p + vec2(0.0, eps), t) - base;
            
            vec2 grad = vec2(dx, dy) / eps;
            vec2 normal = grad / (length(grad) + 0.5);
            
            vec2 globalSplitDir = normalize(vec2(1.0, 1.0));
            vec2 splitDir = normalize(mix(globalSplitDir, normal, uRefraction));
            
            float colR = structure(p + splitDir * uDispersion, t);
            float colG = structure(p, t);
            float colB = structure(p - splitDir * uDispersion, t);
            
            vec3 color = vec3(colR, colG, colB);
            color = smoothstep(0.1, 0.9, color);
            color *= uColorTint * uBrightness;
            
            vec3 finalColor = mix(vec3(0.02, 0.02, 0.05), color, length(color));

            float luminance = dot(finalColor, vec3(0.299, 0.587, 0.114));
            float grainWeight = 1.0 - abs(luminance - 0.5) * 2.0;
            grainWeight = mix(0.4, 1.0, grainWeight); 
            
            float randomNoise = hash13(vec3(gl_FragCoord.xy, t * 50.0));
            
            float grain = (randomNoise - 0.5) * uFilmGrain * grainWeight;
            finalColor += grain;

            gl_FragColor = vec4(finalColor, 1.0);
        }
    `
});

// 4. Create a full-screen plane mesh
const geometry = new THREE.PlaneGeometry(2, 2);
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);

// 5. Setup lil-gui Control Panel (Only on Desktop, Closed by default)
let gui;
if (window.innerWidth > 768) {
    gui = new GUI({ title: 'Shader Settings' });
    gui.close();

    const optFolder = gui.addFolder('Optics & Dispersion');
    optFolder.add(uniforms.uDispersion, 'value', 0.0, 1.0, 0.01).name('RGB Separation');
    optFolder.add(uniforms.uRefraction, 'value', 0.0, 1.0, 0.01).name('Glass Refraction');

    const geoFolder = gui.addFolder('Geometry');
    geoFolder.add(uniforms.uScale, 'value', 0.5, 5.0, 0.1).name('Macro Scale');
    geoFolder.add(uniforms.uSharpness, 'value', 0.1, 5.0, 0.1).name('Band Sharpness');
    geoFolder.add(uniforms.uDeformation, 'value', 0.0, 2.0, 0.01).name('Lens Deformation');

    const styleFolder = gui.addFolder('Style & Motion');
    styleFolder.add(uniforms.uSpeed, 'value', 0.0, 2.0, 0.01).name('Speed');
    styleFolder.add(uniforms.uBrightness, 'value', 0.1, 1.5, 0.01).name('Brightness');
    styleFolder.addColor(uniforms.uColorTint, 'value').name('Global Tint');
    styleFolder.add(uniforms.uFilmGrain, 'value', 0.0, 0.2, 0.001).name('Film Grain');
}

// 6. Animation Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    uniforms.uTime.value = clock.getElapsedTime();
    renderer.render(scene, camera);
}

animate();

// 7. Handle Window Resize
window.addEventListener('resize', () => {
    uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});
