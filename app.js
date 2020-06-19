import { WebXRButton } from "./js/util/webxr-button.js";
import { Scene } from "./js/render/scenes/scene.js";
import { Renderer, createWebGLContext } from "./js/render/core/renderer.js";
import { Node } from "./js/render/core/node.js";
import { Gltf2Node } from "./js/render/nodes/gltf2.js";
import { DropShadowNode } from "./js/render/nodes/drop-shadow.js";
import { vec3 } from "./js/render/math/gl-matrix.js";
import { Ray } from "./js/render/math/ray.js";

// XR globals.
let xrButton = document.getElementById("xr-button");
let xrSession = null;
let xrRefSpace = null;
let xrViewerSpace = null;
let xrHitTestSource = null;

// WebGL scene globals.
let gl = null;
let renderer = null;
let scene = new Scene();
scene.enableStats(false);

let arObject = new Node();
arObject.visible = false;
scene.addNode(arObject);

let reticle = new Gltf2Node({ url: "media/gltf/reticle/reticle.gltf" });
reticle.visible = false;
scene.addNode(reticle);

// Having a really simple drop shadow underneath an object helps ground
// it in the world without adding much complexity.
let shadow = new DropShadowNode();
vec3.set(shadow.scale, 0.15, 0.15, 0.15);
arObject.addNode(shadow);

const MAX_FLOWERS = 1;
let flowers = [];

// Ensure the background is transparent for AR.
scene.clear = false;

function checkSupportedState() {
  navigator.xr.isSessionSupported("immersive-ar").then((supported) => {
    if (supported) {
      xrButton.innerHTML = "Enter AR";
    } else {
      xrButton.innerHTML = "AR not found";
    }

    xrButton.disabled = !supported;
  });
}

function initXR() {
  if (!window.isSecureContext) {
    let message = "WebXR unavailable due to insecure context";
    document.getElementById("warning-zone").innerText = message;
  }

  if (navigator.xr) {
    xrButton.addEventListener("click", onButtonClicked);
    navigator.xr.addEventListener("devicechange", checkSupportedState);
    checkSupportedState();
  }
}

function onButtonClicked() {
  if (!xrSession) {
    // Ask for an optional DOM Overlay, see https://immersive-web.github.io/dom-overlays/
    navigator.xr
      .requestSession("immersive-ar", {
        requiredFeatures: ["local", "hit-test"],
        optionalFeatures: ["dom-overlay"],
        domOverlay: { root: document.getElementById("overlay") },
      })
      .then(onSessionStarted, onRequestSessionError);
  } else {
    xrSession.end();
  }
}

function onSessionStarted(session) {
  xrSession = session;
  xrButton.innerHTML = "Exit AR";
  document.getElementById("overlay").classList.add("ar");

  let choosenObject = document.getElementById("objects").value;
  if (choosenObject == "flower") {
    let flower = new Gltf2Node({ url: "media/gltf/sunflower/sunflower.gltf" });
    arObject.addNode(flower);
  } else if (choosenObject == "stereo") {
    let flower = new Gltf2Node({ url: "media/gltf/stereo/stereo.gltf" });
    arObject.addNode(flower);
  }
  console.log(arObject);
  session.addEventListener("end", onSessionEnded);
  session.addEventListener("select", onSelect);

  if (!gl) {
    gl = createWebGLContext({
      xrCompatible: true,
    });

    renderer = new Renderer(gl);

    scene.setRenderer(renderer);
  }

  session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });

  // In this sample we want to cast a ray straight out from the viewer's
  // position and render a reticle where it intersects with a real world
  // surface. To do this we first get the viewer space, then create a
  // hitTestSource that tracks it.
  session.requestReferenceSpace("viewer").then((refSpace) => {
    xrViewerSpace = refSpace;
    session
      .requestHitTestSource({ space: xrViewerSpace })
      .then((hitTestSource) => {
        xrHitTestSource = hitTestSource;
      });
  });

  session.requestReferenceSpace("local").then((refSpace) => {
    xrRefSpace = refSpace;

    session.requestAnimationFrame(onXRFrame);
  });
}

function onRequestSessionError(ex) {
  alert("Failed to start immersive AR session.");
  console.error(ex.message);
}

function onEndSession(session) {
  xrHitTestSource.cancel();
  xrHitTestSource = null;
  session.end();
}

function onSessionEnded(event) {
  xrSession = null;
  xrButton.innerHTML = "Enter AR";
  document.getElementById("session-info").innerHTML = "";
  gl = null;
  location.reload();
}
function addARObjectAt(matrix) {
  let newFlower = arObject.clone();
  newFlower.visible = true;
  newFlower.matrix = matrix;
  scene.addNode(newFlower);

  flowers.push(newFlower);

  // For performance reasons if we add too many objects start
  // removing the oldest ones to keep the scene complexity
  // from growing too much.
  if (flowers.length > MAX_FLOWERS) {
    let oldFlower = flowers.shift();
    scene.removeNode(oldFlower);
  }
}

let rayOrigin = vec3.create();
let rayDirection = vec3.create();
function onSelect(event) {
  if (reticle.visible) {
    // The reticle should already be positioned at the latest hit point,
    // so we can just use it's matrix to save an unnecessary call to
    // event.frame.getHitTestResults.
    addARObjectAt(reticle.matrix);
  }
}

// Called every time a XRSession requests that a new frame be drawn.
function onXRFrame(t, frame) {
  let session = frame.session;
  let pose = frame.getViewerPose(xrRefSpace);

  reticle.visible = false;

  // If we have a hit test source, get its results for the frame
  // and use the pose to display a reticle in the scene.
  if (xrHitTestSource && pose) {
    let hitTestResults = frame.getHitTestResults(xrHitTestSource);
    if (hitTestResults.length > 0) {
      let pose = hitTestResults[0].getPose(xrRefSpace);
      reticle.visible = true;
      reticle.matrix = pose.transform.matrix;
      document.getElementById("overlay").classList.remove("ar");
    }
  }

  scene.startFrame();

  session.requestAnimationFrame(onXRFrame);

  scene.drawXRFrame(frame, pose);

  scene.endFrame();
}

initXR();
