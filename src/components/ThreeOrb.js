import * as THREE from 'three';

export class ThreeOrb {
  constructor(container) {
    this.container = container;
    this.width = container.clientWidth;
    this.height = container.clientHeight;

    // State
    this.isTalking = false;
    this.mouse = new THREE.Vector2(0, 0);
    this.targetMouse = new THREE.Vector2(0, 0);
    this.intensity = 0.0;

    this.init();
  }

  init() {
    this.scene = new THREE.Scene();

    // Camera: Z=6.0 to prevent clipping of the huge outer orb
    this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.1, 1000);
    this.camera.position.z = 6.0;

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // --- OUTER ORB ---
    // Huge Radius 3.2
    // Increased segments to 192 for MUCH denser particles
    const geometry = new THREE.SphereGeometry(3.2, 192, 192);
    const bufferGeometry = new THREE.BufferGeometry();
    bufferGeometry.setAttribute('position', geometry.attributes.position);
    bufferGeometry.setAttribute('uv', geometry.attributes.uv);

    // --- INNER ORB ---
    // Radius 1.2
    const innerGeometry = new THREE.SphereGeometry(1.2, 96, 96);
    const innerBufferGeometry = new THREE.BufferGeometry();
    innerBufferGeometry.setAttribute('position', innerGeometry.attributes.position);
    innerBufferGeometry.setAttribute('uv', innerGeometry.attributes.uv);

    // SHARED SHADER CODE
    const vertexShader = `
      uniform float uTime;
      uniform float uIntensity;
      uniform vec2 uMouse;
      uniform float uDistortionScale; 
      
      varying vec2 vUv;
      varying float vDisplacement;
      
      // ... (Simplex Noise Code Omitted for Brevity - Standard Imports) ...
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
      vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
      float snoise(vec3 v) {
        const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
        const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i  = floor(v + dot(v, C.yyy) );
        vec3 x0 = v - i + dot(i, C.xxx) ;
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min( g.xyz, l.zxy );
        vec3 i2 = max( g.xyz, l.zxy );
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        vec3 i_ = mod289(i);
        vec4 p = permute( permute( permute(
                  i_.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                + i_.y + vec4(0.0, i1.y, i2.y, 1.0 ))
                + i_.x + vec4(0.0, i1.x, i2.x, 1.0 ));
        float n_ = 0.142857142857;
        vec3  ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_ );
        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4( x.xy, y.xy );
        vec4 b1 = vec4( x.zw, y.zw );
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
        vec3 p0 = vec3(a0.xy,h.x);
        vec3 p1 = vec3(a0.zw,h.y);
        vec3 p2 = vec3(a1.xy,h.z);
        vec3 p3 = vec3(a1.zw,h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                      dot(p2,x2), dot(p3,x3) ) );
      }

      void main() {
        vUv = uv;

        float noiseFreq = 0.8; 
        float noiseAmp = 0.45 * uDistortionScale; 
        
        float baseShape = snoise(position * noiseFreq + uTime * 0.1) * noiseAmp;

        float talkNoise = 0.0;
        if (uIntensity > 0.01) {
             talkNoise = snoise(position * 2.0 + uTime * 0.7) * uIntensity * (0.25 * uDistortionScale);
        }
        
        float hoverDist = length(uMouse);
        float hoverNoise = snoise(position * 1.0 + uTime * 0.5) * (hoverDist * 0.2 * uDistortionScale);

        vDisplacement = baseShape + talkNoise + hoverNoise;
        
        vec3 newPos = position + normalize(position) * vDisplacement;
        
        float rotX = uMouse.y * 0.1;
        float rotY = uMouse.x * 0.1;
        newPos = mat3(cos(rotY),0,-sin(rotY), 0,1,0, sin(rotY),0,cos(rotY)) * 
                 mat3(1,0,0, 0,cos(rotX),sin(rotX), 0,-sin(rotX),cos(rotX)) * newPos;
        
        vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
        
        // VISIBILITY BOOST: Increased base size from 2.0 to 2.8
        gl_PointSize = (2.8 + uIntensity * 2.0) * (1.5 / -mvPosition.z);
        
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const fragmentShader = `
      varying float vDisplacement;
      void main() {
        float r = distance(gl_PointCoord, vec2(0.5));
        if (r > 0.5) discard;
        
        // BRIGHTER PALETTE
        vec3 colorDark = vec3(0.05, 0.1, 0.4); // Brighter darks
        vec3 colorMid = vec3(0.2, 0.5, 1.0);   // More vivid blue
        vec3 colorBright = vec3(0.6, 0.9, 1.0); // Near white highlights
        
        float t = smoothstep(-0.4, 0.4, vDisplacement);
        vec3 finalColor = mix(colorDark, colorMid, smoothstep(0.0, 0.5, t));
        finalColor = mix(finalColor, colorBright, smoothstep(0.5, 1.0, t));
        
        // OPACITY BOOST: 0.9 -> 1.0 (Full opacity pts)
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    // --- OUTER MATERIAL (Full Distortion) ---
    this.materialOuter = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uMouse: { value: new THREE.Vector2(0, 0) },
        uDistortionScale: { value: 0.4 } // FULL WARP
      },
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    // --- INNER MATERIAL (Minimal/No Distortion) ---
    this.materialInner = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uMouse: { value: new THREE.Vector2(0, 0) },
        uDistortionScale: { value: 0.2 } // 10% Distortion (Almost Stable Core)
      },
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.points = new THREE.Points(bufferGeometry, this.materialOuter);
    this.scene.add(this.points);

    this.innerPoints = new THREE.Points(innerBufferGeometry, this.materialInner);
    this.scene.add(this.innerPoints);

    this.onResize();
    window.addEventListener('resize', this.onResize.bind(this));
    this.animate();
  }

  setTalking(isTalking) {
    this.isTalking = isTalking;
  }

  updateMouse(x, y) {
    this.targetMouse.x = x;
    this.targetMouse.y = y;
  }

  onResize() {
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }

  animate() {
    requestAnimationFrame(this.animate.bind(this));

    const time = performance.now() / 1000;
    this.mouse.lerp(this.targetMouse, 0.05);

    const targetIntensity = this.isTalking ? 1.0 : 0.0;
    this.intensity += (targetIntensity - this.intensity) * 0.1;

    // Update Outer
    this.materialOuter.uniforms.uTime.value = time;
    this.materialOuter.uniforms.uMouse.value.copy(this.mouse);
    this.materialOuter.uniforms.uIntensity.value = this.intensity;

    // Update Inner
    this.materialInner.uniforms.uTime.value = time;
    this.materialInner.uniforms.uMouse.value.copy(this.mouse);
    this.materialInner.uniforms.uIntensity.value = this.intensity;

    this.renderer.render(this.scene, this.camera);
  }
}
