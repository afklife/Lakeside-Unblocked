import * as THREE from "/node_modules/three/build/three.module.js";

const blockTypes = [
	{ id: "grass", label: "Grass", color: "#789a48", top: "#91b65b", side: "#71894a" },
	{ id: "dirt", label: "Dirt", color: "#916345" },
	{ id: "stone", label: "Stone", color: "#858a84" },
	{ id: "wood", label: "Wood", color: "#9b7044", top: "#c09258" },
	{ id: "leaves", label: "Leaves", color: "#4c8b55" },
	{ id: "sand", label: "Sand", color: "#d9c27c" }
];

const blockMap = new Map(blockTypes.map((block) => [block.id, block]));
const keyFor = (x, y, z) => `${x},${y},${z}`;

function seededNoise(x, z, salt = 0) {
	const value = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453;
	return value - Math.floor(value);
}

function makeBlockTexture(base, seed) {
	const canvas = document.createElement("canvas");
	canvas.width = 16;
	canvas.height = 16;
	const context = canvas.getContext("2d");
	context.fillStyle = base;
	context.fillRect(0, 0, 16, 16);
	for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
		const shade = seededNoise(x + seed, y - seed, seed) > .53 ? "#ffffff18" : "#10140b18";
		context.fillStyle = shade;
		context.fillRect(x, y, 1, 1);
	}
	const texture = new THREE.CanvasTexture(canvas);
	texture.magFilter = THREE.NearestFilter;
	texture.minFilter = THREE.NearestFilter;
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}

function terrainHeight(x, z) {
	return Math.round(1.2 + Math.sin(x * .19) * 1.1 + Math.cos(z * .17) * .9 + Math.sin((x + z) * .11) * .7);
}

function makeTerrain() {
	const blocks = new Map();
	const put = (x, y, z, type) => blocks.set(keyFor(x, y, z), { x, y, z, type });
	for (let x = -17; x <= 17; x++) for (let z = -17; z <= 17; z++) {
		const height = terrainHeight(x, z);
		for (let y = -3; y <= height; y++) put(x, y, z, y === height ? (Math.abs(x) > 15 || Math.abs(z) > 15 ? "sand" : "grass") : y >= height - 2 ? "dirt" : "stone");
		if (Math.abs(x) > 3 && Math.abs(z) > 3 && seededNoise(x, z, 2) > .986) {
			const treeHeight = 3 + Math.floor(seededNoise(x, z, 4) * 2);
			for (let dy = 1; dy <= treeHeight; dy++) put(x, height + dy, z, "wood");
			for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = treeHeight - 1; dy <= treeHeight + 1; dy++) {
				if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy - treeHeight) < 5 && !(dx === 0 && dz === 0 && dy <= treeHeight)) put(x + dx, height + dy, z + dz, "leaves");
			}
		}
	}
	return blocks;
}

export function mountVoxelGame(stage) {
	stage.innerHTML = `<div class="voxel-frame">
		<div class="voxel-topbar">
			<div class="voxel-brand">Voxel Grove</div>
			<div class="voxel-room-controls">
				<input id="voxel-name" maxlength="18" aria-label="Player name" placeholder="Your name">
				<button class="voxel-action primary" id="voxel-create">New world</button>
				<input id="voxel-room-input" maxlength="8" aria-label="Room code" placeholder="Room code">
				<button class="voxel-action" id="voxel-join">Join</button>
				<button class="voxel-action" id="voxel-share" disabled>Share</button>
				<span class="voxel-status" id="voxel-status">Starting...</span>
			</div>
		</div>
		<div class="voxel-presence">Room <strong id="voxel-room-label">------</strong> · <strong id="voxel-player-count">1</strong> here</div>
		<div class="voxel-center-prompt" id="voxel-enter">Click to enter the world</div>
		<div class="voxel-tools">
			<div class="voxel-mode-row" role="group" aria-label="Block mode">
				<button class="voxel-action selected" data-voxel-mode="mine">Mine</button>
				<button class="voxel-action" data-voxel-mode="build">Build</button>
				<span class="voxel-status" id="voxel-selected-label">Grass selected</span>
			</div>
			<div class="voxel-block-row" id="voxel-blocks"></div>
		</div>
		<div class="voxel-chat">
			<div class="voxel-chat-log" id="voxel-chat-log" aria-live="polite"></div>
			<form class="voxel-chat-form" id="voxel-chat-form">
				<input id="voxel-chat-input" maxlength="120" aria-label="World chat" placeholder="Say something..." autocomplete="off">
				<button class="voxel-action" type="submit">Send</button>
			</form>
		</div>
		<div class="voxel-dpad" aria-label="Movement controls">
			<button class="voxel-action" data-walk="forward" aria-label="Forward">↑</button>
			<button class="voxel-action" data-walk="left" aria-label="Left">←</button>
			<button class="voxel-action" data-walk="back" aria-label="Back">↓</button>
			<button class="voxel-action" data-walk="right" aria-label="Right">→</button>
		</div>
		<canvas class="voxel-canvas" id="voxel-canvas" aria-label="Voxel Grove 3D world"></canvas>
	</div>`;

	const frame = stage.querySelector(".voxel-frame");
	const canvas = stage.querySelector("#voxel-canvas");
	const status = stage.querySelector("#voxel-status");
	const roomLabel = stage.querySelector("#voxel-room-label");
	const playerCount = stage.querySelector("#voxel-player-count");
	const chatLog = stage.querySelector("#voxel-chat-log");
	const nameInput = stage.querySelector("#voxel-name");
	const roomInput = stage.querySelector("#voxel-room-input");
	const shareButton = stage.querySelector("#voxel-share");
	const abort = new AbortController();
	const { signal } = abort;
	const world = makeTerrain();
	const remotePlayers = new Map();
	const pressed = new Set();
	const yaw = { value: 0 };
	const pitch = { value: -.15 };
	let socket = null;
	let roomCode = "";
	let playerId = "";
	let playerName = localStorage.getItem("lakesideVoxelName") || "Builder";
	let selectedBlock = "grass";
	let mode = "mine";
	let locked = false;
	let dragging = false;
	let pointerStart = null;
	let lastSentAt = 0;
	let localPosition = new THREE.Vector3(0, 8, 8);
	let verticalSpeed = 0;
	let animationId = 0;
	let cleaned = false;
	let worldMeshes = [];

	nameInput.value = playerName;
	const seedRoom = new URLSearchParams(location.search).get("room");
	roomInput.value = seedRoom ? seedRoom.toUpperCase() : "";

	const scene = new THREE.Scene();
	scene.background = new THREE.Color("#9bcee2");
	scene.fog = new THREE.Fog("#9bcee2", 30, 82);
	const camera = new THREE.PerspectiveCamera(72, 1, .1, 120);
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.1;

	scene.add(new THREE.HemisphereLight("#e4f5ff", "#5b6144", 2.1));
	const sun = new THREE.DirectionalLight("#fff0c6", 2.6);
	sun.position.set(-18, 32, 15);
	sun.castShadow = true;
	sun.shadow.mapSize.set(1024, 1024);
	sun.shadow.camera.left = -25;
	sun.shadow.camera.right = 25;
	sun.shadow.camera.top = 25;
	sun.shadow.camera.bottom = -25;
	scene.add(sun);

	const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
	const textures = [];
	const materials = new Map();
	for (const block of blockTypes) {
		const side = makeBlockTexture(block.side || block.color, block.id.length + 2);
		const top = block.top ? makeBlockTexture(block.top, block.id.length + 7) : side;
		textures.push(side);
		if (top !== side) textures.push(top);
		const bottom = block.id === "grass" ? makeBlockTexture("#795a3c", 19) : side;
		if (block.id === "grass") textures.push(bottom);
		materials.set(block.id, [
			new THREE.MeshLambertMaterial({ map: side }), new THREE.MeshLambertMaterial({ map: side }),
			new THREE.MeshLambertMaterial({ map: top }), new THREE.MeshLambertMaterial({ map: bottom }),
			new THREE.MeshLambertMaterial({ map: side }), new THREE.MeshLambertMaterial({ map: side })
		]);
	}

	const highlight = new THREE.LineSegments(
		new THREE.EdgesGeometry(new THREE.BoxGeometry(1.025, 1.025, 1.025)),
		new THREE.LineBasicMaterial({ color: "#efff8c", linewidth: 2 })
	);
	highlight.visible = false;
	scene.add(highlight);

	function rebuildWorld() {
		worldMeshes.forEach((mesh) => scene.remove(mesh));
		worldMeshes = [];
		const grouped = new Map(blockTypes.map(({ id }) => [id, []]));
		world.forEach((block) => grouped.get(block.type)?.push(block));
		const helper = new THREE.Object3D();
		for (const [type, blocks] of grouped) {
			if (!blocks.length) continue;
			const mesh = new THREE.InstancedMesh(cubeGeometry, materials.get(type), blocks.length);
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			mesh.userData.positions = blocks.map(({ x, y, z }) => ({ x, y, z }));
			blocks.forEach((block, index) => {
				helper.position.set(block.x, block.y, block.z);
				helper.updateMatrix();
				mesh.setMatrixAt(index, helper.matrix);
			});
			mesh.instanceMatrix.needsUpdate = true;
			mesh.computeBoundingSphere();
			scene.add(mesh);
			worldMeshes.push(mesh);
		}
	}

	function makeNameSprite(name, color) {
		const labelCanvas = document.createElement("canvas");
		labelCanvas.width = 256;
		labelCanvas.height = 64;
		const context = labelCanvas.getContext("2d");
		context.fillStyle = "#101a17d9";
		context.beginPath();
		context.roundRect(8, 8, 240, 48, 12);
		context.fill();
		context.fillStyle = color;
		context.fillRect(8, 8, 5, 48);
		context.fillStyle = "#fff";
		context.font = "bold 25px Trebuchet MS, sans-serif";
		context.textAlign = "center";
		context.textBaseline = "middle";
		context.fillText(name.slice(0, 16), 132, 33);
		const texture = new THREE.CanvasTexture(labelCanvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		textures.push(texture);
		const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
		sprite.scale.set(2.1, .52, 1);
		sprite.position.y = 2.08;
		return sprite;
	}

	function makeAvatar(player) {
		const group = new THREE.Group();
		const color = new THREE.Color(player.color || "#e87851");
		const bodyMaterial = new THREE.MeshLambertMaterial({ color });
		const pantsMaterial = new THREE.MeshLambertMaterial({ color: "#303b45" });
		const skinMaterial = new THREE.MeshLambertMaterial({ color: "#e2b48b" });
		const body = new THREE.Mesh(new THREE.BoxGeometry(.62, .78, .34), bodyMaterial);
		body.position.y = 1.04;
		const head = new THREE.Mesh(new THREE.BoxGeometry(.46, .46, .46), skinMaterial);
		head.position.y = 1.68;
		const legs = new THREE.Mesh(new THREE.BoxGeometry(.56, .55, .3), pantsMaterial);
		legs.position.y = .38;
		group.add(body, head, legs, makeNameSprite(player.name || "Builder", player.color || "#e87851"));
		group.position.set(player.position?.x || 0, player.position?.y || 0, player.position?.z || 0);
		group.rotation.y = player.position?.yaw || 0;
		scene.add(group);
		return { group, target: { ...(player.position || { x: 0, y: 0, z: 0, yaw: 0 }) } };
	}

	function addRemotePlayer(player) {
		if (!player || player.id === playerId) return;
		const existing = remotePlayers.get(player.id);
		if (existing) {
			existing.target = { ...player.position };
			return;
		}
		remotePlayers.set(player.id, makeAvatar(player));
		playerCount.textContent = String(remotePlayers.size + 1);
	}

	function removeRemotePlayer(id) {
		const player = remotePlayers.get(id);
		if (!player) return;
		scene.remove(player.group);
		remotePlayers.delete(id);
		playerCount.textContent = String(remotePlayers.size + 1);
	}

	function addChat(name, text) {
		const line = document.createElement("div");
		line.className = "voxel-chat-line";
		const author = document.createElement("strong");
		author.textContent = `${name}: `;
		line.append(author, document.createTextNode(text));
		chatLog.append(line);
		while (chatLog.childElementCount > 18) chatLog.firstElementChild.remove();
		chatLog.scrollTop = chatLog.scrollHeight;
	}

	function setStatus(text) { status.textContent = text; }

	function connectRoom(code, create) {
		roomCode = code.toUpperCase();
		roomInput.value = roomCode;
		roomLabel.textContent = roomCode;
		setStatus("Connecting...");
		shareButton.disabled = true;
		remotePlayers.forEach(({ group }) => scene.remove(group));
		remotePlayers.clear();
		playerCount.textContent = "1";
		if (socket) socket.close(1000, "Changing world");
		const protocol = location.protocol === "https:" ? "wss:" : "ws:";
		const host = location.host || "localhost:3000";
		const connection = new WebSocket(`${protocol}//${host}/ws`);
		socket = connection;
		connection.addEventListener("open", () => {
			connection.send(JSON.stringify({ type: "join", game: "voxel", room: roomCode, name: nameInput.value || playerName, create }));
		}, { signal });
		connection.addEventListener("message", (event) => {
			let message;
			try { message = JSON.parse(event.data); } catch { return; }
			if (message.type === "joined") {
				playerId = message.playerId;
				roomCode = message.room;
				roomLabel.textContent = roomCode;
				roomInput.value = roomCode;
				playerCount.textContent = String(message.players.length);
				shareButton.disabled = false;
				setStatus("World synced");
				message.players.forEach(addRemotePlayer);
				message.blocks.forEach((block) => {
					const key = keyFor(block.x, block.y, block.z);
					world.set(key, block);
				});
				rebuildWorld();
				addChat("World", `Connected to ${roomCode}.`);
			} else if (message.type === "player-joined") {
				addRemotePlayer(message.player);
				addChat("World", `${message.player.name} joined.`);
			} else if (message.type === "player-left") {
				removeRemotePlayer(message.id);
				addChat("World", `${message.name} left.`);
			} else if (message.type === "player-moved") {
				const player = remotePlayers.get(message.id);
				if (player) player.target = message.position;
			} else if (message.type === "block-change") {
				const { block } = message;
				const key = keyFor(block.x, block.y, block.z);
				if (block.type === null) world.delete(key);
				else world.set(key, block);
				rebuildWorld();
			} else if (message.type === "chat") addChat(message.name, message.text);
			else if (message.type === "error") setStatus(message.message);
		}, { signal });
		connection.addEventListener("close", () => {
			if (socket === connection) { setStatus("Offline world"); shareButton.disabled = true; }
		}, { signal });
		connection.addEventListener("error", () => {
			if (socket === connection) setStatus("Server unavailable · solo world");
		}, { signal });
	}

	function send(message) {
		if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
	}

	function addBlockPalette() {
		const palette = stage.querySelector("#voxel-blocks");
		palette.innerHTML = blockTypes.map((block) => `<button class="voxel-action voxel-block${block.id === selectedBlock ? " selected" : ""}" data-block="${block.id}"><span class="voxel-swatch" style="background:${block.color}"></span>${block.label}</button>`).join("");
		palette.querySelectorAll("[data-block]").forEach((button) => button.addEventListener("click", () => {
			selectedBlock = button.dataset.block;
			palette.querySelectorAll("[data-block]").forEach((item) => item.classList.toggle("selected", item === button));
			stage.querySelector("#voxel-selected-label").textContent = `${blockMap.get(selectedBlock).label} selected`;
		}));
	}

	function blockAt(x, y, z) {
		const minX = Math.floor(x - .29 + .5), maxX = Math.floor(x + .29 + .5);
		const minZ = Math.floor(z - .29 + .5), maxZ = Math.floor(z + .29 + .5);
		const minY = Math.floor(y + .04 + .5), maxY = Math.floor(y + 1.7 - .04 + .5);
		for (let bx = minX; bx <= maxX; bx++) for (let bz = minZ; bz <= maxZ; bz++) for (let by = minY; by <= maxY; by++) {
			const block = world.get(keyFor(bx, by, bz));
			if (block && y < by + .5 && y + 1.7 > by - .5) return block;
		}
		return null;
	}

	function highestSurface(x, z, below) {
		let surface = null;
		for (let bx = Math.floor(x - .28 + .5); bx <= Math.floor(x + .28 + .5); bx++) for (let bz = Math.floor(z - .28 + .5); bz <= Math.floor(z + .28 + .5); bz++) {
			for (let by = Math.floor(below + .5); by >= Math.floor(below - 1 + .5); by--) {
				if (world.has(keyFor(bx, by, bz))) {
					const top = by + .5;
					if (top <= below + .08 && (surface === null || top > surface)) surface = top;
				}
			}
		}
		return surface;
	}

	const raycaster = new THREE.Raycaster();
	const screenCenter = new THREE.Vector2(0, 0);

	function currentBlockHit() {
		raycaster.setFromCamera(screenCenter, camera);
		const intersections = raycaster.intersectObjects(worldMeshes, false);
		const hit = intersections.find((entry) => entry.distance <= 6);
		if (!hit || hit.instanceId === undefined) return null;
		const block = hit.object.userData.positions[hit.instanceId];
		return block ? { block, face: hit.face.normal } : null;
	}

	function editTarget() {
		const hit = currentBlockHit();
		if (!hit) return;
		let block;
		if (mode === "mine") {
			if (hit.block.y <= -3) return;
			block = { ...hit.block, type: null };
		} else {
			const x = hit.block.x + Math.round(hit.face.x);
			const y = hit.block.y + Math.round(hit.face.y);
			const z = hit.block.z + Math.round(hit.face.z);
			if (Math.abs(x - localPosition.x) < .8 && Math.abs(z - localPosition.z) < .8 && y >= localPosition.y - .1 && y <= localPosition.y + 1.8) return;
			block = { x, y, z, type: selectedBlock };
		}
		const key = keyFor(block.x, block.y, block.z);
		if (block.type === null) world.delete(key);
		else world.set(key, block);
		rebuildWorld();
		send({ type: "block-change", block });
	}

	function updateHighlight() {
		const hit = currentBlockHit();
		highlight.visible = Boolean(hit);
		if (hit) highlight.position.set(hit.block.x, hit.block.y, hit.block.z);
	}

	function connectFromFields(code, create = false) {
		playerName = nameInput.value.trim().slice(0, 18) || "Builder";
		nameInput.value = playerName;
		localStorage.setItem("lakesideVoxelName", playerName);
		connectRoom(code, create);
	}

	function makeRoomCode() {
		return Math.random().toString(36).slice(2, 8).toUpperCase();
	}

	stage.querySelector("#voxel-create").addEventListener("click", () => connectFromFields(makeRoomCode(), true), { signal });
	stage.querySelector("#voxel-join").addEventListener("click", () => {
		const code = roomInput.value.trim().toUpperCase();
		if (code) connectFromFields(code);
		else setStatus("Enter a room code");
	}, { signal });
	roomInput.addEventListener("keydown", (event) => { if (event.key === "Enter") stage.querySelector("#voxel-join").click(); }, { signal });
	shareButton.addEventListener("click", async () => {
		const invite = new URL(location.href);
		invite.searchParams.set("room", roomCode);
		try { await navigator.clipboard.writeText(invite.href); setStatus("Invite copied"); }
		catch { roomInput.select(); setStatus("Copy this room code"); }
	}, { signal });
	stage.querySelectorAll("[data-voxel-mode]").forEach((button) => button.addEventListener("click", () => {
		mode = button.dataset.voxelMode;
		stage.querySelectorAll("[data-voxel-mode]").forEach((item) => item.classList.toggle("selected", item === button));
	}, { signal }));
	stage.querySelector("#voxel-chat-form").addEventListener("submit", (event) => {
		event.preventDefault();
		const input = stage.querySelector("#voxel-chat-input");
		const text = input.value.trim().slice(0, 120);
		if (!text) return;
		if (socket?.readyState === WebSocket.OPEN) send({ type: "chat", text });
		else addChat(playerName, text);
		input.value = "";
	}, { signal });
	nameInput.addEventListener("change", () => { playerName = nameInput.value.trim().slice(0, 18) || "Builder"; localStorage.setItem("lakesideVoxelName", playerName); }, { signal });
	addBlockPalette();

	stage.querySelector("#voxel-enter").addEventListener("click", () => {
		if (canvas.requestPointerLock) canvas.requestPointerLock();
		canvas.focus();
	}, { signal });
	document.addEventListener("pointerlockchange", () => {
		locked = document.pointerLockElement === canvas;
		frame.classList.toggle("locked", locked);
	}, { signal });
	document.addEventListener("mousemove", (event) => {
		if (locked) {
			yaw.value -= event.movementX * .0022;
			pitch.value = THREE.MathUtils.clamp(pitch.value - event.movementY * .002, -1.42, 1.42);
		} else if (dragging && pointerStart) {
			const dx = event.clientX - pointerStart.x, dy = event.clientY - pointerStart.y;
			yaw.value -= dx * .004;
			pitch.value = THREE.MathUtils.clamp(pitch.value - dy * .004, -1.42, 1.42);
			pointerStart = { x: event.clientX, y: event.clientY };
		}
	}, { signal });
	canvas.addEventListener("pointerdown", (event) => {
		dragging = !locked;
		pointerStart = { x: event.clientX, y: event.clientY };
	}, { signal });
	canvas.addEventListener("pointerup", (event) => {
		if (pointerStart) {
			const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
			if (moved < 8) editTarget();
		}
		dragging = false;
		pointerStart = null;
	}, { signal });
	canvas.addEventListener("contextmenu", (event) => event.preventDefault(), { signal });
	window.addEventListener("keydown", (event) => {
		if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
		if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft"].includes(event.code)) { pressed.add(event.code); event.preventDefault(); }
		if (/^Digit[1-6]$/.test(event.code)) {
			const item = blockTypes[Number(event.code.slice(-1)) - 1];
			if (item) stage.querySelector(`[data-block="${item.id}"]`)?.click();
		}
	}, { signal });
	window.addEventListener("keyup", (event) => { pressed.delete(event.code); }, { signal });
	stage.querySelectorAll("[data-walk]").forEach((button) => {
		const keys = { forward: "KeyW", left: "KeyA", back: "KeyS", right: "KeyD" };
		const key = keys[button.dataset.walk];
		button.addEventListener("pointerdown", (event) => { event.preventDefault(); pressed.add(key); }, { signal });
		for (const eventName of ["pointerup", "pointerleave", "pointercancel"]) button.addEventListener(eventName, () => pressed.delete(key), { signal });
	});

	function updateMovement(delta) {
		const forwardAmount = Number(pressed.has("KeyW")) - Number(pressed.has("KeyS"));
		const sideAmount = Number(pressed.has("KeyD")) - Number(pressed.has("KeyA"));
		const direction = new THREE.Vector3(sideAmount, 0, -forwardAmount);
		if (direction.lengthSq()) {
			direction.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw.value);
			const step = direction.multiplyScalar(5.4 * delta);
			if (!blockAt(localPosition.x + step.x, localPosition.y, localPosition.z)) localPosition.x += step.x;
			if (!blockAt(localPosition.x, localPosition.y, localPosition.z + step.z)) localPosition.z += step.z;
		}
		const ground = highestSurface(localPosition.x, localPosition.z, localPosition.y);
		const grounded = ground !== null && localPosition.y - ground < .12 && verticalSpeed <= 0;
		if (pressed.has("Space") && grounded) { verticalSpeed = 8.2; pressed.delete("Space"); }
		verticalSpeed -= 21 * delta;
		const nextY = localPosition.y + verticalSpeed * delta;
		const landing = verticalSpeed < 0 ? highestSurface(localPosition.x, localPosition.z, localPosition.y) : null;
		if (landing !== null && nextY <= landing) { localPosition.y = landing; verticalSpeed = 0; }
		else if (!blockAt(localPosition.x, nextY, localPosition.z)) localPosition.y = nextY;
		else verticalSpeed = 0;
		if (localPosition.y < -12) { localPosition.set(0, 10, 8); verticalSpeed = 0; }
		camera.position.set(localPosition.x, localPosition.y + 1.55, localPosition.z);
		camera.rotation.order = "YXZ";
		camera.rotation.set(pitch.value, yaw.value, 0);
		const now = performance.now();
		if (socket?.readyState === WebSocket.OPEN && now - lastSentAt > 75) {
			lastSentAt = now;
			send({ type: "move", position: { x: localPosition.x, y: localPosition.y, z: localPosition.z, yaw: yaw.value } });
		}
	}

	function animate() {
		if (cleaned) return;
		animationId = requestAnimationFrame(animate);
		const delta = Math.min(clock.getDelta(), .05);
		updateMovement(delta);
		remotePlayers.forEach(({ group, target }) => {
			group.position.lerp(new THREE.Vector3(target.x, target.y, target.z), Math.min(1, delta * 10));
			const angle = THREE.MathUtils.euclideanModulo(target.yaw - group.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
			group.rotation.y += angle * Math.min(1, delta * 10);
		});
		updateHighlight();
		renderer.render(scene, camera);
	}

	const clock = new THREE.Clock();
	const resizeObserver = new ResizeObserver(() => {
		const bounds = frame.getBoundingClientRect();
		if (!bounds.width || !bounds.height) return;
		camera.aspect = bounds.width / bounds.height;
		camera.updateProjectionMatrix();
		renderer.setSize(bounds.width, bounds.height, false);
	});
	resizeObserver.observe(frame);
	rebuildWorld();
	const sharedRoom = new URLSearchParams(location.search).get("room");
	connectFromFields(sharedRoom && /^[A-Z0-9]{4,8}$/i.test(sharedRoom) ? sharedRoom : makeRoomCode(), !sharedRoom);
	animate();

	return () => {
		cleaned = true;
		cancelAnimationFrame(animationId);
		abort.abort();
		resizeObserver.disconnect();
		if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, "Leaving world");
		if (document.pointerLockElement === canvas) document.exitPointerLock();
		remotePlayers.forEach(({ group }) => scene.remove(group));
		worldMeshes.forEach((mesh) => { mesh.geometry.dispose(); scene.remove(mesh); });
		cubeGeometry.dispose();
		materials.forEach((blockMaterials) => blockMaterials.forEach((material) => material.dispose()));
		textures.forEach((texture) => texture.dispose());
		highlight.geometry.dispose();
		highlight.material.dispose();
		renderer.dispose();
	};
}