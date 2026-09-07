import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import type { Module } from '@/lib/hive'

/**
 * THE COMB IN THREE DIMENSIONS, ON BABYLON -- THE SAME ENGINE AS t27.ai.
 *
 * Owner, 2026-09-07: "the same map on the Babylon.js game engine", "do Babylon
 * on the web Hive tab".
 *
 * WHY THIS FILE IS LOADED LAZILY AND NOTHING ELSE IMPORTS IT
 *
 * `@babylonjs/core` is megabytes. This app is a Telegram Mini App opened on
 * phones, often on mobile data, and four of its five tabs have nothing to do
 * with 3-D. Importing Babylon anywhere that the main bundle can reach would
 * make every person pay for a scene most of them never open.
 *
 * So: `Hive.tsx` reaches this through `React.lazy`, the import inside is
 * dynamic on top of that, and the engine is only fetched when somebody is
 * actually looking at the comb. The measured chunk size is in the commit.
 *
 * WHY THE COLOURS ARE WHAT THEY ARE
 *
 * Her own board colours cells "covered by t27 / hand-written", which IS the
 * mission -- and it cannot be reproduced from public data: spec names and
 * repository paths do not join (13 of 115 by last path segment). Inventing a
 * coverage colour would be a lie the eye believes instantly.
 *
 * What is shown is what `modules.json` actually carries:
 *   amber  the Queen has open issues here -- the same numbers as the kanban
 *   green  quiet
 *   height how much code the module holds, on a log scale
 *
 * WHAT HAPPENS WHEN 3-D IS NOT AVAILABLE
 *
 * WebGL is missing or blocked on more phones than people expect, and a Mini App
 * webview is exactly where it happens. `onFallback` tells the parent to draw
 * the flat map instead. A blank canvas that never explains itself is the worst
 * outcome, so it is not one of the outcomes.
 */

export interface CombSceneProps {
  modules: Module[]
  /** Called with the module under the pointer, or null when nothing is picked. */
  onPick: (module: Module | null) => void
  /** Called once if the scene cannot start; the parent then draws the flat map. */
  onFallback: (why: string) => void
}

export default function CombScene({
  modules,
  onPick,
  onFallback,
}: CombSceneProps) {
  const { t } = useLanguage()
  const hostRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host || !modules.length) return

    /*
     * THE CANVAS IS CREATED HERE, NOT IN THE MARKUP, AND THAT IS THE FIX.
     *
     * React StrictMode mounts an effect, tears it down, and mounts it again in
     * development. With one canvas held in the markup, that means: engine A
     * takes the canvas WebGL context, cleanup disposes engine A and RELEASES
     * that context, then engine B attaches to the same canvas and gets a dead
     * one. It throws nothing, reports WebGL2, builds all 115 meshes -- and
     * draws zero frames. Measured exactly that way before this changed.
     *
     * A canvas per effect run means every engine owns a context nobody else
     * can release. The element goes away with the run that made it.
     */
    const canvas = document.createElement('canvas')
    canvas.className = 'comb3d__canvas'
    host.appendChild(canvas)
    /*
     * SIZED BEFORE THE ENGINE SEES IT.
     *
     * A canvas appended a moment ago has no laid-out size yet, so `new Engine`
     * reads 0 x 0 and Babylon then skips every frame -- the render loop runs
     * and draws nothing, which is exactly the symptom this file already has a
     * guard for. Taking the size from the host, which IS laid out, avoids
     * waiting a frame for something that is already known.
     */
    canvas.width = Math.max(host.clientWidth, 1)
    canvas.height = Math.max(host.clientHeight, 1)

    let disposed = false
    let dispose: (() => void) | undefined
    ;(async () => {
      try {
        /*
         * THE WHOLE MODULE, and that is deliberate after a measurement.
         *
         * The first version imported seven names from their own paths to let
         * Rollup drop the rest. Babylon 9 started, reported WebGL2, threw
         * nothing -- and drew an empty canvas: `MeshBuilder.CreateCylinder`
         * needs its builder registered by a side-effect import that named
         * imports do not pull in. A silent empty scene is a worse outcome than
         * a larger chunk.
         *
         * The chunk is lazy, so only people who open the comb pay for it, and
         * its measured size is in the commit message. Tree-shaking it properly
         * is worth doing once somebody can verify each import actually still
         * renders.
         */
        const BABYLON = await import('@babylonjs/core')
        const {
          Engine,
          Scene,
          ArcRotateCamera,
          HemisphericLight,
          Vector3,
          Color3,
          Color4,
          MeshBuilder,
          StandardMaterial,
        } = BABYLON

        if (disposed) return

        const engine = new Engine(canvas, true, {
          preserveDrawingBuffer: false,
          stencil: false,
          // A Mini App webview on a mid-range phone does not need a retina
          // 3-D scene; it needs a scene that does not drain the battery.
          adaptToDeviceRatio: false,
        })
        const scene = new Scene(engine)
        // Transparent so the page background shows through: a black rectangle
        // inside a dark page reads as a broken image.
        scene.clearColor = new Color4(0, 0, 0, 0)

        const perRow = 11
        const R = 0.62 // hexagon radius
        const stepX = R * Math.sqrt(3)
        const stepZ = R * 1.5
        const rows = Math.ceil(modules.length / perRow)

        /*
         * THE CAMERA IS FRAMED FROM THE BOARD, NOT PICKED BY EYE.
         *
         * Two guesses were tried first: 26 left the comb a postage stamp on a
         * desktop, and 17 cropped its edges on a 375pt phone. A fixed number
         * cannot be right for both, because the panel is 46vh of whatever
         * screen it lands on.
         *
         * So the distance is derived: half the board's diagonal, divided by
         * the tangent of half the field of view, and widened when the canvas is
         * narrower than it is tall -- which is exactly the phone case.
         */
        const boardW = perRow * stepX
        const boardD = rows * stepZ
        const half = Math.hypot(boardW, boardD) / 2
        const aspect = Math.max(canvas.width / Math.max(canvas.height, 1), 0.1)
        const fit =
          (half / Math.tan(0.4)) * (aspect < 1 ? 1 / aspect : 1) * 0.72

        const camera = new ArcRotateCamera(
          'camera',
          -Math.PI / 2,
          Math.PI / 3.2,
          fit,
          Vector3.Zero(),
          scene
        )
        camera.attachControl(canvas, true)
        camera.lowerRadiusLimit = fit * 0.5
        camera.upperRadiusLimit = fit * 2.2
        // The board is a field, not an object: tilting under it shows nothing
        // and only loses people.
        camera.upperBetaLimit = Math.PI / 2.1
        camera.wheelPrecision = 24
        camera.panningSensibility = 0

        new HemisphericLight('light', new Vector3(0.3, 1, 0.2), scene)

        // Two materials, not one per cell: 115 materials is 115 shader binds
        // per frame, and this scene has exactly two states.
        const busyMat = new StandardMaterial('busy', scene)
        busyMat.diffuseColor = Color3.FromHexString('#C9A227')
        busyMat.specularColor = new Color3(0.05, 0.05, 0.05)
        const quietMat = new StandardMaterial('quiet', scene)
        quietMat.diffuseColor = Color3.FromHexString('#0E8A55')
        quietMat.specularColor = new Color3(0.05, 0.05, 0.05)

        const maxLines = Math.max(...modules.map(m => m.lines), 1)
        /** Log scale: linear left everything but the largest three invisible. */
        const height = (lines: number) => {
          const t = Math.log(Math.max(lines, 1)) / Math.log(maxLines)
          return 0.25 + 2.6 * Math.min(Math.max(t, 0), 1)
        }

        modules.forEach((m, i) => {
          const row = Math.floor(i / perRow)
          const col = i % perRow
          const cell = MeshBuilder.CreateCylinder(
            `cell-${i}`,
            { diameter: R * 2, height: height(m.lines), tessellation: 6 },
            scene
          )
          // Pointy-top hexagons interlock when odd rows shift half a step.
          cell.position.x =
            (col - (perRow - 1) / 2) * stepX + (row % 2 ? stepX / 2 : 0)
          cell.position.z = (row - (rows - 1) / 2) * stepZ
          cell.position.y = height(m.lines) / 2
          cell.rotation.y = Math.PI / 6
          cell.material = m.busy ? busyMat : quietMat
          cell.metadata = m
        })

        scene.onPointerDown = () => {
          const hit = scene.pick(scene.pointerX, scene.pointerY)
          onPick((hit?.pickedMesh?.metadata as Module) ?? null)
        }

        /*
         * A SILENT EMPTY SCENE IS A REAL OUTCOME, SO IT IS CHECKED.
         *
         * Measured: with named Babylon imports the engine started, reported
         * WebGL2, threw nothing at all -- and drew 115 nothings, because
         * `MeshBuilder.CreateCylinder` was not registered. The catch below
         * never fired, so the flat fallback never fired either, and the person
         * got a black rectangle with no explanation.
         *
         * Counting meshes turns that class of failure into the fallback it
         * should always have been.
         */
        if (scene.meshes.length < modules.length) {
          engine.dispose()
          onFallback(
            `the scene built ${scene.meshes.length} cells of ${modules.length}`
          )
          return
        }

        /*
         * ONE FRAME IS DRAWN BY HAND, AND THAT IS THE PROOF.
         *
         * The first guard counted frames from the render loop a second later.
         * It fired constantly -- because `runRenderLoop` is driven by
         * `requestAnimationFrame`, and rAF does not tick in a tab that is not
         * being painted. A backgrounded tab is not a broken scene, but the
         * guard could not tell the difference and sent everybody to the flat
         * map.
         *
         * Rendering once directly asks the right question: CAN this scene
         * draw. If that throws or leaves the buffer empty, the scene is broken
         * and the flat map is correct. If it succeeds, the loop is free to
         * idle whenever the browser stops painting.
         */
        try {
          scene.render()
        } catch (e) {
          engine.dispose()
          onFallback(
            `the scene could not draw a frame: ${
              e instanceof Error ? e.message : String(e)
            }`
          )
          return
        }

        engine.runRenderLoop(() => scene.render())
        const resize = () => engine.resize()
        window.addEventListener('resize', resize)

        setReady(true)
        dispose = () => {
          window.removeEventListener('resize', resize)
          engine.stopRenderLoop()
          scene.dispose()
          engine.dispose()
        }
      } catch (e) {
        /*
         * Reported, never swallowed. WebGL is absent or blocked on more phones
         * than people expect, and a Mini App webview is where it happens. The
         * parent draws the flat map; a blank canvas that never explains itself
         * is not one of the outcomes.
         */
        onFallback(e instanceof Error ? e.message : String(e))
      }
    })()

    return () => {
      disposed = true
      dispose?.()
      canvas.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules])

  return (
    <div className="comb3d" ref={hostRef}>
      {!ready && <p className="hive-note">{t('hive.building')}</p>}
    </div>
  )
}
