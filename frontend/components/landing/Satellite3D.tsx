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

      // Lighting - Optimized for White Satellite
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
      scene.add(ambientLight);

      const mainLight = new THREE.DirectionalLight(0xffffff, 2.8);
      mainLight.position.set(12, 12, 12);
      scene.add(mainLight);

      const blueRimLight = new THREE.DirectionalLight(0x0284c7, 1.6);
      blueRimLight.position.set(-12, -8, 8);
      scene.add(blueRimLight);

      const softFillLight = new THREE.PointLight(0xe2e8f0, 1.5, 35);
      softFillLight.position.set(0, -10, 8);
      scene.add(softFillLight);

      // ─── SATELLITE GROUP (Crisp White Aerospace Finish) ────────
      const satelliteGroup = new THREE.Group();

      // Materials
      const whiteAerospaceMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.15,
        roughness: 0.25,
      });

      const darkTitaniumMaterial = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.85,
        roughness: 0.2,
      });

      const silverMaterial = new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.9,
        roughness: 0.15,
      });

      const solarPanelMaterial = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        metalness: 0.7,
        roughness: 0.12,
      });

      const lensMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x0284c7,
        metalness: 0.3,
        roughness: 0.05,
        transmission: 0.85,
        thickness: 0.9,
      });

      const glowLineMaterial = new THREE.LineBasicMaterial({
        color: 0x0284c7,
        transparent: true,
        opacity: 0.45,
      });

      // 1. Central Bus (Crisp White Main Body)
      const bodyGeometry = new THREE.BoxGeometry(2.2, 3.0, 2.0);
      const mainBody = new THREE.Mesh(bodyGeometry, whiteAerospaceMaterial);
      satelliteGroup.add(mainBody);

      // Bus detail rings & panels
      const busBandGeo = new THREE.BoxGeometry(2.26, 0.4, 2.06);
      const busBand = new THREE.Mesh(busBandGeo, darkTitaniumMaterial);
      busBand.position.y = 0.4;
      satelliteGroup.add(busBand);

      const lowerBandGeo = new THREE.BoxGeometry(2.26, 0.2, 2.06);
      const lowerBand = new THREE.Mesh(lowerBandGeo, silverMaterial);
      lowerBand.position.y = -0.8;
      satelliteGroup.add(lowerBand);

      // 2. Optical Sensor Turret & Aperture Lens (bottom)
      const turretGeo = new THREE.CylinderGeometry(0.7, 0.9, 1.2, 32);
      const turret = new THREE.Mesh(turretGeo, darkTitaniumMaterial);
      turret.position.y = -2.0;
      satelliteGroup.add(turret);

      const lensGeo = new THREE.CircleGeometry(0.65, 32);
      const lens = new THREE.Mesh(lensGeo, lensMaterial);
      lens.position.y = -2.61;
      lens.rotation.x = Math.PI / 2;
      satelliteGroup.add(lens);

      // 3. SAR Radar Dish Antenna (White Dish)
      const dishGeo = new THREE.SphereGeometry(1.25, 32, 16, 0, Math.PI * 2, 0, Math.PI / 3);
      const dish = new THREE.Mesh(dishGeo, whiteAerospaceMaterial);
      dish.position.set(0, 1.9, 0.3);
      dish.rotation.x = -Math.PI / 3;
      dish.scale.set(1, 1, 0.4);
      satelliteGroup.add(dish);

      const dishFeedGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.0, 8);
      const dishFeed = new THREE.Mesh(dishFeedGeo, silverMaterial);
      dishFeed.position.set(0, 2.3, 0.8);
      dishFeed.rotation.x = Math.PI / 4;
      satelliteGroup.add(dishFeed);

      // 4. Solar Panel Arrays (Left & Right Wings with White Frames)
      const createSolarWing = (isLeft: boolean) => {
        const wingGroup = new THREE.Group();
        const side = isLeft ? -1 : 1;

        // Connecting Boom
        const boomGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.2, 16);
        const boom = new THREE.Mesh(boomGeo, silverMaterial);
        boom.rotation.z = Math.PI / 2;
        boom.position.x = side * 1.5;
        wingGroup.add(boom);

        // 3-Segment Solar Panels
        for (let i = 0; i < 3; i++) {
          const panelFrameGeo = new THREE.BoxGeometry(1.6, 2.4, 0.08);
          const panelFrame = new THREE.Mesh(panelFrameGeo, whiteAerospaceMaterial);
          panelFrame.position.x = side * (2.6 + i * 1.7);

          const cellGeo = new THREE.BoxGeometry(1.48, 2.26, 0.1);
          const cell = new THREE.Mesh(cellGeo, solarPanelMaterial);
          panelFrame.add(cell);

          // Solar Photovoltaic Grid Lines
          const gridGeo = new THREE.PlaneGeometry(1.46, 2.24, 4, 6);
          const gridMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            wireframe: true,
            transparent: true,
            opacity: 0.45,
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
        const thruster = new THREE.Mesh(thrusterGeo, darkTitaniumMaterial);
        thruster.position.set(x, 1.6, z);
        thruster.rotation.x = Math.PI;
        satelliteGroup.add(thruster);
      }

      satelliteGroup.scale.set(0.9, 0.9, 0.9);
      satelliteGroup.rotation.x = 0.25;
      satelliteGroup.rotation.y = -0.4;
      scene.add(satelliteGroup);

      // ─── ORBITAL RINGS & SENSOR CONE ──────────────────
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
        color: 0x0284c7,
        wireframe: true,
        transparent: true,
        opacity: 0.12,
      });
      const sensorCone = new THREE.Mesh(coneGeo, coneMat);
      sensorCone.position.set(0, -5.2, 0);
      sensorCone.rotation.x = Math.PI;
      scene.add(sensorCone);

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
      <div className="w-full h-full min-h-[360px] flex flex-col items-center justify-center p-6 text-center space-y-3">
        <div className="w-14 h-14 rounded-full bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-600">
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-slate-800">Cartosat-2S & RISAT Satellite Platform</p>
        <p className="text-xs text-slate-500 font-mono">Orbital Telemetry Nominal | WebGL 2.0</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-[380px] sm:h-[440px] lg:h-[480px] relative overflow-hidden cursor-grab active:cursor-grabbing select-none"
    >
      {/* Floating Telemetry Badge */}
      <div className="absolute top-2 left-2 z-10 px-3 py-1 rounded-full border border-slate-300 bg-white/80 backdrop-blur-md text-[10px] font-mono text-slate-700 flex items-center gap-2 shadow-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
        CARTOSAT-2S / RISAT ORBITAL NODE
      </div>
      <div className="absolute bottom-2 right-2 z-10 px-3 py-1 rounded-full border border-slate-300 bg-white/80 backdrop-blur-md text-[10px] font-mono text-slate-600 flex items-center gap-2 shadow-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
        DRAG TO ROTATE 3D SATELLITE
      </div>
    </div>
  );
}
