'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export default function Satellite3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animationFrameId: number;

    try {
      // Scene & Camera
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        45,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
      );
      camera.position.set(0, 0, 14);

      // Renderer
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(renderer.domElement);

      // Lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
      scene.add(ambientLight);

      const sunLight = new THREE.DirectionalLight(0x38bdf8, 2.5);
      sunLight.position.set(10, 10, 10);
      scene.add(sunLight);

      const goldLight = new THREE.PointLight(0xf59e0b, 2, 30);
      goldLight.position.set(-10, -5, 5);
      scene.add(goldLight);

      const blueLight = new THREE.PointLight(0x818cf8, 1.8, 30);
      blueLight.position.set(5, -10, 5);
      scene.add(blueLight);

      // ─── SATELLITE GROUP ──────────────────────────────
      const satelliteGroup = new THREE.Group();

      // Materials
      const goldFoilMaterial = new THREE.MeshStandardMaterial({
        color: 0xd97706,
        metalness: 0.9,
        roughness: 0.25,
      });

      const titaniumMaterial = new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.85,
        roughness: 0.2,
      });

      const solarPanelMaterial = new THREE.MeshStandardMaterial({
        color: 0x1e3a8a,
        metalness: 0.6,
        roughness: 0.15,
        wireframe: false,
      });

      const lensMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x0284c7,
        metalness: 0.2,
        roughness: 0.05,
        transmission: 0.8,
        thickness: 0.8,
      });

      const glowLineMaterial = new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.6,
      });

      // 1. Central Bus (Main Body)
      const bodyGeometry = new THREE.BoxGeometry(2.2, 3.0, 2.0);
      const mainBody = new THREE.Mesh(bodyGeometry, goldFoilMaterial);
      satelliteGroup.add(mainBody);

      // Bus detail rings
      const busBandGeo = new THREE.BoxGeometry(2.3, 0.4, 2.1);
      const busBand = new THREE.Mesh(busBandGeo, titaniumMaterial);
      busBand.position.y = 0.5;
      satelliteGroup.add(busBand);

      // 2. Optical Sensor Turret & Aperture Lens (bottom)
      const turretGeo = new THREE.CylinderGeometry(0.7, 0.9, 1.2, 32);
      const turret = new THREE.Mesh(turretGeo, titaniumMaterial);
      turret.position.y = -2.0;
      satelliteGroup.add(turret);

      const lensGeo = new THREE.CircleGeometry(0.65, 32);
      const lens = new THREE.Mesh(lensGeo, lensMaterial);
      lens.position.y = -2.61;
      lens.rotation.x = Math.PI / 2;
      satelliteGroup.add(lens);

      // 3. SAR Radar Dish Antenna
      const dishGeo = new THREE.SphereGeometry(1.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 3);
      const dish = new THREE.Mesh(dishGeo, titaniumMaterial);
      dish.position.set(0, 1.9, 0.3);
      dish.rotation.x = -Math.PI / 3;
      dish.scale.set(1, 1, 0.4);
      satelliteGroup.add(dish);

      const dishFeedGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.0, 8);
      const dishFeed = new THREE.Mesh(dishFeedGeo, goldFoilMaterial);
      dishFeed.position.set(0, 2.3, 0.8);
      dishFeed.rotation.x = Math.PI / 4;
      satelliteGroup.add(dishFeed);

      // 4. Solar Panel Arrays (Left & Right Wings)
      const createSolarWing = (isLeft: boolean) => {
        const wingGroup = new THREE.Group();
        const side = isLeft ? -1 : 1;

        // Connecting Boom
        const boomGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.2, 16);
        const boom = new THREE.Mesh(boomGeo, titaniumMaterial);
        boom.rotation.z = Math.PI / 2;
        boom.position.x = side * 1.5;
        wingGroup.add(boom);

        // 3-Segment Solar Panels
        for (let i = 0; i < 3; i++) {
          const panelFrameGeo = new THREE.BoxGeometry(1.6, 2.4, 0.08);
          const panelFrame = new THREE.Mesh(panelFrameGeo, titaniumMaterial);
          panelFrame.position.x = side * (2.6 + i * 1.7);

          const cellGeo = new THREE.BoxGeometry(1.48, 2.26, 0.1);
          const cell = new THREE.Mesh(cellGeo, solarPanelMaterial);
          panelFrame.add(cell);

          // Solar Grid Lines
          const gridGeo = new THREE.PlaneGeometry(1.46, 2.24, 4, 6);
          const gridMat = new THREE.MeshBasicMaterial({
            color: 0x60a5fa,
            wireframe: true,
            transparent: true,
            opacity: 0.4,
          });
          const grid = new THREE.Mesh(gridGeo, gridMat);
          grid.position.z = 0.06;
          panelFrame.add(grid);

          wingGroup.add(panelFrame);
        }

        return wingGroup;
      };

      const leftWing = createSolarWing(true);
      const rightWing = createSolarWing(false);
      satelliteGroup.add(leftWing);
      satelliteGroup.add(rightWing);

      // 5. Thruster Nozzles
      const thrusterGeo = new THREE.ConeGeometry(0.2, 0.4, 16);
      for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
        const thruster = new THREE.Mesh(thrusterGeo, titaniumMaterial);
        thruster.position.set(x, 1.6, z);
        thruster.rotation.x = Math.PI;
        satelliteGroup.add(thruster);
      }

      satelliteGroup.scale.set(0.9, 0.9, 0.9);
      satelliteGroup.rotation.x = 0.25;
      satelliteGroup.rotation.y = -0.4;
      scene.add(satelliteGroup);

      // ─── ORBITAL RINGS & SENSOR CONE ──────────────────
      const orbitRingGeo = new THREE.RingGeometry(7.5, 7.55, 64);
      const orbitRing = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(
          new THREE.EllipseCurve(0, 0, 8, 4, 0, 2 * Math.PI, false, 0).getPoints(64).map(p => new THREE.Vector3(p.x, p.y, 0))
        ),
        glowLineMaterial
      );
      orbitRing.rotation.x = Math.PI / 2.3;
      orbitRing.rotation.y = 0.3;
      scene.add(orbitRing);

      // Sensor Footprint Cone on Ground
      const coneGeo = new THREE.ConeGeometry(3.5, 5.0, 32, 1, true);
      const coneMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        wireframe: true,
        transparent: true,
        opacity: 0.12,
      });
      const sensorCone = new THREE.Mesh(coneGeo, coneMat);
      sensorCone.position.set(0, -5.2, 0);
      sensorCone.rotation.x = Math.PI;
      scene.add(sensorCone);

      // ─── STARFIELD PARTICLES ──────────────────────────
      const starsCount = 180;
      const starGeometry = new THREE.BufferGeometry();
      const starPositions = new Float32Array(starsCount * 3);
      for (let i = 0; i < starsCount * 3; i += 3) {
        starPositions[i] = (Math.random() - 0.5) * 35;
        starPositions[i + 1] = (Math.random() - 0.5) * 35;
        starPositions[i + 2] = (Math.random() - 0.5) * 20 - 5;
      }
      starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
      const starMaterial = new THREE.PointsMaterial({
        color: 0x93c5fd,
        size: 0.08,
        transparent: true,
        opacity: 0.7,
      });
      const starField = new THREE.Points(starGeometry, starMaterial);
      scene.add(starField);

      // ─── MOUSE INTERACTION & ANIMATION ────────────────
      let mouseX = 0;
      let mouseY = 0;
      let targetRotationY = -0.4;
      let targetRotationX = 0.25;

      const onMouseMove = (e: MouseEvent) => {
        const rect = container.getBoundingClientRect();
        mouseX = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
        mouseY = -(((e.clientY - rect.top) / container.clientHeight) * 2 - 1);
        targetRotationY = -0.4 + mouseX * 0.45;
        targetRotationX = 0.25 - mouseY * 0.3;
      };

      window.addEventListener('mousemove', onMouseMove);

      // Resize listener
      const onResize = () => {
        if (!container) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      };
      window.addEventListener('resize', onResize);

      // Render Loop
      let clock = new THREE.Clock();
      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);
        const elapsedTime = clock.getElapsedTime();

        // Idle floating and smooth damping
        satelliteGroup.position.y = Math.sin(elapsedTime * 1.2) * 0.25;
        satelliteGroup.rotation.y += (targetRotationY - satelliteGroup.rotation.y) * 0.05 + 0.003;
        satelliteGroup.rotation.x += (targetRotationX - satelliteGroup.rotation.x) * 0.05;
        satelliteGroup.rotation.z = Math.sin(elapsedTime * 0.8) * 0.05;

        // Rotate solar panel subtly
        leftWing.rotation.x = Math.sin(elapsedTime * 0.6) * 0.08;
        rightWing.rotation.x = Math.sin(elapsedTime * 0.6) * 0.08;

        // Sensor footprint pulsing
        sensorCone.scale.set(
          1 + Math.sin(elapsedTime * 2) * 0.05,
          1,
          1 + Math.sin(elapsedTime * 2) * 0.05
        );
        orbitRing.rotation.z = elapsedTime * 0.08;

        renderer.render(scene, camera);
      };

      animate();

      return () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('resize', onResize);
        cancelAnimationFrame(animationFrameId);
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
        renderer.dispose();
      };
    } catch (err) {
      console.error('Three.js initialization failed:', err);
      setHasError(true);
    }
  }, []);

  if (hasError) {
    return (
      <div className="w-full h-full min-h-[380px] rounded-3xl bg-slate-900/40 border border-sky-500/20 flex flex-col items-center justify-center p-6 text-center space-y-3">
        <div className="w-16 h-16 rounded-full bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-foreground">Interactive 3D Satellite Stream</p>
        <p className="text-xs text-muted-foreground">Orbital telemetry nominal | WebGL 2.0</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-[400px] sm:h-[480px] lg:h-[540px] relative rounded-3xl overflow-hidden cursor-grab active:cursor-grabbing"
    >
      {/* Floating Telemetry Badges */}
      <div className="absolute top-4 left-4 z-10 px-3 py-1.5 rounded-full border border-sky-500/30 bg-slate-950/60 backdrop-blur-md text-[10px] font-mono text-sky-300 flex items-center gap-2 shadow-lg">
        <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping" />
        CARTOSAT-2S / RISAT ORBITAL NODE
      </div>
      <div className="absolute bottom-4 right-4 z-10 px-3 py-1.5 rounded-full border border-emerald-500/30 bg-slate-950/60 backdrop-blur-md text-[10px] font-mono text-emerald-300 flex items-center gap-2 shadow-lg">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        INTERACTIVE 3D · DRAG TO ROTATE
      </div>
    </div>
  );
}
