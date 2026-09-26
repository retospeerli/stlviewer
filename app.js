import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/*
  GitHub:
  - Die Ordner-/Dateiliste wird über die GitHub-API gelesen.
  - Die STL-Dateien selbst werden DIREKT von GitHub Pages geladen.
  - Dadurch bleiben Anzeige und Download auf derselben Domain.
*/

const CONFIG = {
  OWNER: "",
  REPO: "",
  BRANCH: "main",
  STL_ROOT: "stl"
};

const $ = id => document.getElementById(id);

const library = $("library");
const searchInput = $("searchInput");
const viewer = $("viewer");
const viewerWrap = $("viewerWrap");
const fileInput = $("fileInput");
const resetBtn = $("resetBtn");
const wireframeBtn = $("wireframeBtn");
const fullscreenBtn = $("fullscreenBtn");
const downloadBtn = $("downloadBtn");
const colorPicker = $("colorPicker");
const loading = $("loading");
const status = $("status");

function detectRepo() {
  if (CONFIG.OWNER && CONFIG.REPO) {
    return {
      owner: CONFIG.OWNER,
      repo: CONFIG.REPO
    };
  }

  const host = location.hostname;
  const parts = location.pathname.split("/").filter(Boolean);

  if (host.endsWith(".github.io")) {
    const owner = host.replace(".github.io", "");

    const repo = parts.length
      ? parts[0]
      : `${owner}.github.io`;

    return { owner, repo };
  }

  return null;
}

const repoInfo = detectRepo();

function apiTreeUrl() {
  return `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/git/trees/${encodeURIComponent(CONFIG.BRANCH)}?recursive=1`;
}

/*
  STL-Dateien werden direkt über GitHub Pages geladen.
  Beispiel:
  https://retospeerli.github.io/stlviewer/stl/Ordner/modell.stl
*/
function pagesUrl(path) {
  const encodedPath = path
    .split("/")
    .map(segment => encodeURIComponent(segment))
    .join("/");

  return new URL(encodedPath, document.baseURI).href;
}


/* ============================================================
   THREE.JS
   ============================================================ */

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  45,
  viewer.clientWidth / viewer.clientHeight,
  0.1,
  100000
);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});

renderer.setPixelRatio(
  Math.min(window.devicePixelRatio, 2)
);

renderer.setSize(
  viewer.clientWidth,
  viewer.clientHeight
);

renderer.outputColorSpace = THREE.SRGBColorSpace;

viewer.appendChild(renderer.domElement);

const controls = new OrbitControls(
  camera,
  renderer.domElement
);

controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;


/* ============================================================
   LICHT
   ============================================================ */

scene.add(
  new THREE.HemisphereLight(
    0xffffff,
    0x666666,
    2
  )
);

const light1 = new THREE.DirectionalLight(
  0xffffff,
  3
);

light1.position.set(3, 4, 5);

scene.add(light1);

const light2 = new THREE.DirectionalLight(
  0xffffff,
  1.5
);

light2.position.set(-4, 2, -3);

scene.add(light2);


/* ============================================================
   RASTER
   ============================================================ */

const grid = new THREE.GridHelper(
  200,
  20,
  0x999999,
  0xcccccc
);

grid.material.opacity = 0.25;
grid.material.transparent = true;

scene.add(grid);


/* ============================================================
   STL
   ============================================================ */

const loader = new STLLoader();

const material = new THREE.MeshStandardMaterial({
  color: colorPicker.value,
  roughness: 0.55,
  metalness: 0.08
});

let mesh = null;
let wireframe = false;
let allModels = [];
let currentPath = null;


/* ============================================================
   KAMERA
   ============================================================ */

function fit(object) {

  const box =
    new THREE.Box3()
      .setFromObject(object);

  const size =
    new THREE.Vector3();

  const center =
    new THREE.Vector3();

  box.getSize(size);
  box.getCenter(center);

  const maxDim =
    Math.max(
      size.x,
      size.y,
      size.z
    ) || 1;

  const fov =
    THREE.MathUtils.degToRad(
      camera.fov
    );

  let cameraZ =
    Math.abs(
      maxDim /
      (2 * Math.tan(fov / 2))
    );

  cameraZ *= 1.65;

  camera.position.set(
    center.x + cameraZ * 0.65,
    center.y + cameraZ * 0.45,
    center.z + cameraZ
  );

  camera.near =
    Math.max(
      maxDim / 1000,
      0.01
    );

  camera.far =
    Math.max(
      maxDim * 100,
      1000
    );

  camera.updateProjectionMatrix();

  controls.target.copy(center);

  controls.minDistance =
    maxDim * 0.05;

  controls.maxDistance =
    maxDim * 20;

  controls.update();

  grid.scale.setScalar(
    Math.max(
      maxDim / 200,
      0.01
    )
  );
}


/* ============================================================
   MODELL ANZEIGEN
   ============================================================ */

function showGeometry(
  geometry,
  name
) {

  if (mesh) {

    scene.remove(mesh);

    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
  }

  geometry.computeVertexNormals();

  geometry.center();

  geometry.computeBoundingBox();

  mesh =
    new THREE.Mesh(
      geometry,
      material
    );

  /*
    Viele STL-Dateien verwenden Z als Hochachse.
    Three.js verwendet standardmässig Y.
  */
  mesh.rotation.x =
    -Math.PI / 2;

  scene.add(mesh);

  fit(mesh);

  const triangles =
    Math.floor(
      (
        geometry
          .attributes
          .position
          ?.count || 0
      ) / 3
    );

  const size =
    new THREE.Vector3();

  geometry
    .boundingBox
    .getSize(size);

  status.textContent =
    `${name} · ` +
    `${triangles.toLocaleString("de-CH")} Dreiecke · ` +
    `${size.x.toFixed(1)} × ` +
    `${size.y.toFixed(1)} × ` +
    `${size.z.toFixed(1)} mm`;
}


/* ============================================================
   MODELL AUS GITHUB PAGES LADEN
   ============================================================ */

async function loadModel(model) {

  loading.classList.add("show");

  currentPath =
    model.path;

  markActive();

  try {

    console.log(
      "Lade STL:",
      model.url
    );

    const response =
      await fetch(
        model.url,
        {
          cache: "no-store"
        }
      );

    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}: ${model.url}`
      );
    }

    const contentType =
      response.headers.get(
        "content-type"
      ) || "";

    /*
      Falls GitHub Pages statt STL
      eine HTML-Fehlerseite liefert.
    */
    if (
      contentType.includes(
        "text/html"
      )
    ) {

      throw new Error(
        `HTML statt STL erhalten: ${model.url}`
      );
    }

    const buffer =
      await response.arrayBuffer();

    const geometry =
      loader.parse(buffer);

    showGeometry(
      geometry,
      model.name
    );

    downloadBtn.href =
      model.url;

    downloadBtn.download =
      model.name;

    downloadBtn.classList.remove(
      "disabled"
    );

  } catch (error) {

    console.error(error);

    status.textContent =
      "Das Modell konnte nicht geladen werden. " +
      "Prüfe Dateiname und Pfad im Repository.";

  } finally {

    loading.classList.remove(
      "show"
    );
  }
}


/* ============================================================
   LOKALE STL ÖFFNEN
   ============================================================ */

function openLocal(file) {

  if (!file) return;

  if (
    !file.name
      .toLowerCase()
      .endsWith(".stl")
  ) {

    status.textContent =
      "Bitte eine STL-Datei auswählen.";

    return;
  }

  const reader =
    new FileReader();

  reader.onload =
    event => {

      try {

        currentPath = null;

        markActive();

        const geometry =
          loader.parse(
            event.target.result
          );

        showGeometry(
          geometry,
          file.name
        );

        downloadBtn
          .classList
          .add("disabled");

        downloadBtn
          .removeAttribute("href");

      } catch (error) {

        console.error(error);

        status.textContent =
          "Die STL-Datei konnte nicht gelesen werden.";
      }
    };

  reader.readAsArrayBuffer(file);
}


/* ============================================================
   GITHUB-BIBLIOTHEK LADEN
   ============================================================ */

async function loadLibrary() {

  if (!repoInfo) {

    library.innerHTML = `
      <div class="empty">
        Repository konnte nicht automatisch erkannt werden.
        Trage OWNER und REPO oben in app.js ein.
      </div>
    `;

    return;
  }

  try {

    const response =
      await fetch(
        apiTreeUrl(),
        {
          cache: "no-store"
        }
      );

    if (!response.ok) {

      throw new Error(
        `GitHub API: HTTP ${response.status}`
      );
    }

    const data =
      await response.json();

    const root =
      CONFIG.STL_ROOT
        .replace(
          /^\/+|\/+$/g,
          ""
        );

    allModels =
      data.tree

        .filter(
          item =>
            item.type === "blob" &&
            item.path
              .toLowerCase()
              .endsWith(".stl")
        )

        .filter(
          item =>
            !root ||
            item.path
              .startsWith(
                root + "/"
              )
        )

        .map(
          item => {

            const relativePath =
              root
                ? item.path.slice(
                    root.length + 1
                  )
                : item.path;

            const parts =
              relativePath.split("/");

            const name =
              parts.pop();

            return {
              name,
              path: item.path,
              relativePath,
              folders: parts,
              url: pagesUrl(
                item.path
              )
            };
          }
        )

        .sort(
          (a, b) =>
            a.relativePath
              .localeCompare(
                b.relativePath,
                "de",
                {
                  numeric: true
                }
              )
        );

    console.log(
      "Gefundene STL-Dateien:",
      allModels
    );

    renderLibrary();

  } catch (error) {

    console.error(error);

    library.innerHTML = `
      <div class="empty">
        GitHub-Bibliothek konnte nicht geladen werden.
        Prüfe Repository, Branch und STL_ROOT.
      </div>
    `;
  }
}


/* ============================================================
   ORDNERBAUM ERSTELLEN
   ============================================================ */

function makeTree(models) {

  const root = {
    name: "",
    folders: new Map(),
    files: []
  };

  for (
    const model
    of models
  ) {

    let node = root;

    for (
      const folderName
      of model.folders
    ) {

      if (
        !node.folders.has(
          folderName
        )
      ) {

        node.folders.set(
          folderName,
          {
            name: folderName,
            folders: new Map(),
            files: []
          }
        );
      }

      node =
        node.folders.get(
          folderName
        );
    }

    node.files.push(model);
  }

  return root;
}


/* ============================================================
   ORDNER RENDERN
   ============================================================ */

function renderFolder(
  node,
  parent
) {

  const element =
    document.createElement(
      "div"
    );

  element.className =
    "folder";


  const row =
    document.createElement(
      "div"
    );

  row.className =
    "folder-row";


  const toggle =
    document.createElement(
      "button"
    );

  toggle.className =
    "folder-toggle";

  toggle.textContent =
    "▼";


  const name =
    document.createElement(
      "span"
    );

  name.textContent =
    "📁 " + node.name;


  row.append(
    toggle,
    name
  );

  element.append(row);


  const children =
    document.createElement(
      "div"
    );

  children.className =
    "folder-children";


  /*
    Unterordner
  */
  [
    ...node.folders.values()
  ]

    .sort(
      (a, b) =>
        a.name.localeCompare(
          b.name,
          "de",
          {
            numeric: true
          }
        )
    )

    .forEach(
      folder =>
        renderFolder(
          folder,
          children
        )
    );


  /*
    STL-Dateien
  */
  [
    ...node.files
  ]

    .sort(
      (a, b) =>
        a.name.localeCompare(
          b.name,
          "de",
          {
            numeric: true
          }
        )
    )

    .forEach(
      model => {

        const button =
          document.createElement(
            "button"
          );

        button.className =
          "model-button";

        button.dataset.path =
          model.path;


        const label =
          document.createElement(
            "span"
          );

        label.textContent =
          model.name.replace(
            /\.stl$/i,
            ""
          );


        const path =
          document.createElement(
            "span"
          );

        path.className =
          "model-path";

        path.textContent =
          model.relativePath;


        button.append(
          label,
          path
        );


        button.addEventListener(
          "click",
          () =>
            loadModel(model)
        );


        children.appendChild(
          button
        );
      }
    );


  toggle.addEventListener(
    "click",
    () => {

      element.classList.toggle(
        "collapsed"
      );

      toggle.textContent =
        element
          .classList
          .contains(
            "collapsed"
          )
          ? "▶"
          : "▼";
    }
  );


  element.append(
    children
  );

  parent.appendChild(
    element
  );
}


/* ============================================================
   BIBLIOTHEK ANZEIGEN
   ============================================================ */

function renderLibrary() {

  const term =
    searchInput.value
      .trim()
      .toLowerCase();

  const filtered =
    allModels.filter(
      model =>
        model.relativePath
          .toLowerCase()
          .includes(term)
    );

  if (!filtered.length) {

    library.innerHTML =
      `
      <div class="empty">
        Keine STL-Dateien gefunden.
      </div>
      `;

    return;
  }

  const tree =
    makeTree(filtered);

  library.innerHTML =
    "";


  /*
    echte Ordner
  */
  [
    ...tree.folders.values()
  ]

    .sort(
      (a, b) =>
        a.name.localeCompare(
          b.name,
          "de",
          {
            numeric: true
          }
        )
    )

    .forEach(
      folder =>
        renderFolder(
          folder,
          library
        )
    );


  /*
    STL-Dateien direkt im stl-Hauptordner
  */
  if (
    tree.files.length
  ) {

    renderFolder(
      {
        name: "Allgemein",
        folders: new Map(),
        files: tree.files
      },
      library
    );
  }


  markActive();
}


/* ============================================================
   AKTIVES MODELL
   ============================================================ */

function markActive() {

  document
    .querySelectorAll(
      ".model-button"
    )
    .forEach(
      button => {

        button
          .classList
          .toggle(
            "active",
            button.dataset.path ===
              currentPath
          );
      }
    );
}


/* ============================================================
   BEDIENUNG
   ============================================================ */

searchInput.addEventListener(
  "input",
  renderLibrary
);


fileInput.addEventListener(
  "change",
  event => {

    openLocal(
      event.target.files[0]
    );
  }
);


colorPicker.addEventListener(
  "input",
  () => {

    material.color.set(
      colorPicker.value
    );
  }
);


wireframeBtn.addEventListener(
  "click",
  () => {

    wireframe =
      !wireframe;

    material.wireframe =
      wireframe;

    wireframeBtn.textContent =
      wireframe
        ? "Drahtgitter: ein"
        : "Drahtgitter: aus";
  }
);


resetBtn.addEventListener(
  "click",
  () => {

    if (mesh) {
      fit(mesh);
    }
  }
);


fullscreenBtn.addEventListener(
  "click",
  async () => {

    if (
      !document.fullscreenElement
    ) {

      await viewerWrap
        .requestFullscreen();

    } else {

      await document
        .exitFullscreen();
    }
  }
);


/* ============================================================
   RESIZE
   ============================================================ */

function resize() {

  camera.aspect =
    viewer.clientWidth /
    viewer.clientHeight;

  camera
    .updateProjectionMatrix();

  renderer.setSize(
    viewer.clientWidth,
    viewer.clientHeight
  );
}


window.addEventListener(
  "resize",
  resize
);


document.addEventListener(
  "fullscreenchange",
  () => {

    setTimeout(
      resize,
      50
    );
  }
);


/* ============================================================
   ANIMATION
   ============================================================ */

function animate() {

  requestAnimationFrame(
    animate
  );

  controls.update();

  renderer.render(
    scene,
    camera
  );
}


camera.position.set(
  100,
  80,
  120
);

controls.target.set(
  0,
  0,
  0
);

controls.update();

animate();

loadLibrary();
