import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const CERTIFICATE_NAME =
	process.env.OPENSCREEN_LOCAL_SIGNING_IDENTITY ?? "OpenScreen Local Development";
const PRODUCT_NAME = "Openscreen";
const APP_ID = "com.siddharthvaddem.openscreen";
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(projectDir, "package.json"), "utf8"));
const releaseDir = path.join(projectDir, "release", packageJson.version);
const installPath = path.join("/Applications", `${PRODUCT_NAME}.app`);
const stagingPath = path.join("/Applications", `.${PRODUCT_NAME}.app.local-signing-stage`);
const keychainPath = path.join(os.homedir(), "Library", "Keychains", "login.keychain-db");
const nativeHelperDir = path.join(projectDir, "electron", "native", "bin", "darwin-arm64");
const nativeHelpers = ["openscreen-macos-cursor-helper", "openscreen-screencapturekit-helper"].map(
	(name) => path.join(nativeHelperDir, name),
);

function run(command, args, options = {}) {
	console.log(`\n> ${command} ${args.join(" ")}`);
	execFileSync(command, args, {
		cwd: projectDir,
		stdio: "inherit",
		...options,
	});
}

function read(command, args) {
	const result = spawnSync(command, args, {
		cwd: projectDir,
		encoding: "utf8",
	});
	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
	}
	return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function findSigningIdentity() {
	const result = spawnSync("security", ["find-identity", "-v", "-p", "codesigning", keychainPath], {
		encoding: "utf8",
	});
	const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
	const escapedName = CERTIFICATE_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = output.match(new RegExp(`\\b([0-9A-F]{40})\\s+"${escapedName}"`, "i"));

	if (!match) {
		throw new Error(
			[
				`A valid \"${CERTIFICATE_NAME}\" code-signing identity was not found.`,
				"Open Keychain Access and confirm that the certificate is trusted for code signing and has its private key.",
				`Checked keychain: ${keychainPath}`,
			].join("\n"),
		);
	}

	return match[1].toUpperCase();
}

function findPackagedApp() {
	const candidates = [
		path.join(releaseDir, "mac-arm64", `${PRODUCT_NAME}.app`),
		path.join(releaseDir, "mac", `${PRODUCT_NAME}.app`),
	];
	const appPath = candidates.find((candidate) => fs.existsSync(candidate));
	if (!appPath) {
		throw new Error(`Packaged app was not found. Checked:\n${candidates.join("\n")}`);
	}
	return appPath;
}

function verifySignedApp(appPath, identityHash) {
	run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
	const details = read("codesign", ["-dvvv", appPath]);
	const requirement = read("codesign", ["-dr", "-", appPath]);
	const identifier = details.match(/^Identifier=(.+)$/m)?.[1];
	const authorities = [...details.matchAll(/^Authority=(.+)$/gm)].map((match) => match[1]);

	if (identifier !== APP_ID) {
		throw new Error(`Unexpected bundle identifier: ${identifier ?? "missing"}`);
	}
	if (!authorities.includes(CERTIFICATE_NAME)) {
		throw new Error(
			`The app is not signed by \"${CERTIFICATE_NAME}\". Authorities: ${authorities.join(", ") || "none"}`,
		);
	}

	console.log(`\nSigning identity: ${CERTIFICATE_NAME} (${identityHash})`);
	console.log(`Designated requirement: ${requirement.trim()}`);
}

function signApp(appPath, identityHash) {
	run("codesign", [
		"--force",
		"--deep",
		"--sign",
		identityHash,
		"--options",
		"runtime",
		"--timestamp=none",
		"--entitlements",
		path.join(projectDir, "macos.entitlements"),
		appPath,
	]);
}

function installApp(sourceApp, identityHash) {
	if (fs.existsSync(stagingPath)) {
		fs.rmSync(stagingPath, { recursive: true, force: true });
	}

	run("ditto", ["--rsrc", "--extattr", sourceApp, stagingPath]);
	verifySignedApp(stagingPath, identityHash);

	spawnSync("pkill", ["-x", PRODUCT_NAME], { stdio: "ignore" });
	if (fs.existsSync(installPath)) {
		fs.rmSync(installPath, { recursive: true, force: true });
	}
	fs.renameSync(stagingPath, installPath);
	verifySignedApp(installPath, identityHash);
}

if (process.platform !== "darwin") {
	throw new Error("Local signed installation is only supported on macOS.");
}
if (process.arch !== "arm64") {
	throw new Error("This local installation workflow currently supports Apple Silicon only.");
}

const identityHash = findSigningIdentity();

// A directory target avoids producing another large DMG for every local update.
const rebuildNative = process.argv.includes("--rebuild-native");
const missingNativeHelpers = nativeHelpers.filter((helper) => !fs.existsSync(helper));
if (rebuildNative || missingNativeHelpers.length > 0) {
	if (missingNativeHelpers.length > 0) {
		console.log(`Missing native helpers:\n${missingNativeHelpers.join("\n")}`);
	}
	run("npm", ["run", "build:native:mac"]);
} else {
	console.log(
		"Reusing existing Apple Silicon native helpers. Pass --rebuild-native after installing full Xcode to rebuild them.",
	);
}
run("npm", ["exec", "--", "tsc"]);
run("npm", ["exec", "--", "vite", "build"]);
run(
	"npm",
	["exec", "--", "electron-builder", "--mac", "dir", "--arm64", "--config.mac.identity=null"],
	{
		env: {
			...process.env,
			// Package without electron-builder's per-resource signing pass, then
			// sign the completed local bundle once below.
			CSC_IDENTITY_AUTO_DISCOVERY: "false",
		},
	},
);

const packagedApp = findPackagedApp();
signApp(packagedApp, identityHash);
verifySignedApp(packagedApp, identityHash);
installApp(packagedApp, identityHash);

// The installed app is the durable local artifact; discard the duplicate package.
fs.rmSync(path.dirname(packagedApp), { recursive: true, force: true });

console.log(`\nInstalled signed app: ${installPath}`);
console.log(
	"Grant Screen & System Audio Recording and Accessibility once more. Future installs from this command retain the same signing identity.",
);
