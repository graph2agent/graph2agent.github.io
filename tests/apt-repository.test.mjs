import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFile,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const builder = join(repositoryRoot, "scripts", "build-apt-repository.sh");

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    ...options,
  });
}

function runChecked(command, args, options = {}) {
  const result = run(command, args, options);
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

function commandExists(command) {
  return (
    spawnSync(
      "/bin/sh",
      ["-c", 'command -v "$1" >/dev/null 2>&1', "sh", command],
      { encoding: "utf8" },
    ).status === 0
  );
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function generateKey(home, identity) {
  await mkdir(home, { recursive: true, mode: 0o700 });
  await chmod(home, 0o700);
  runChecked("gpg", [
    "--homedir",
    home,
    "--batch",
    "--pinentry-mode",
    "loopback",
    "--passphrase",
    "",
    "--quick-generate-key",
    identity,
    "rsa2048",
    "sign",
    "1d",
  ]);
  const listing = runChecked("gpg", [
    "--homedir",
    home,
    "--batch",
    "--with-colons",
    "--fingerprint",
    "--list-secret-keys",
  ]).stdout;
  const fingerprint = listing
    .split("\n")
    .map((line) => line.split(":"))
    .find((fields) => fields[0] === "fpr")?.[9];
  assert.match(fingerprint ?? "", /^(?:[0-9A-F]{40}|[0-9A-F]{64})$/);
  return fingerprint;
}

async function makePackage(root, architecture) {
  const packageRoot = join(root, `package-${architecture}`);
  const controlDirectory = join(packageRoot, "DEBIAN");
  const binaryDirectory = join(packageRoot, "usr", "bin");
  await mkdir(controlDirectory, { recursive: true });
  await mkdir(binaryDirectory, { recursive: true });
  await writeFile(
    join(controlDirectory, "control"),
    [
      "Package: graph2agent",
      "Version: 0.2.0-1",
      "Section: utils",
      "Priority: optional",
      `Architecture: ${architecture}`,
      "Maintainer: graph2agent test <test@graph2agent.invalid>",
      "Description: deterministic Mermaid context for coding agents",
      " Test-only package for the signed APT repository integration test.",
      "",
    ].join("\n"),
  );
  const binary = join(binaryDirectory, "graph2agent");
  await writeFile(binary, "#!/bin/sh\nprintf '%s\\n' 'graph2agent 0.2.0'\n");
  await chmod(binary, 0o755);
  const output = join(root, `graph2agent_0.2.0-1_${architecture}.deb`);
  runChecked("dpkg-deb", [
    "--root-owner-group",
    "--build",
    packageRoot,
    output,
  ]);
  return output;
}

async function treeDigest(root) {
  const hash = createHash("sha256");
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const name = relative(root, path);
      hash.update(`${entry.isDirectory() ? "d" : "f"}:${name}\0`);
      if (entry.isDirectory()) {
        await walk(path);
      } else {
        assert.equal(
          entry.isFile(),
          true,
          `unexpected non-regular output: ${name}`,
        );
        hash.update(await readFile(path));
      }
    }
  }
  await walk(root);
  return hash.digest("hex");
}

test("APT builder declares its non-publishing signed-input contract", async () => {
  const help = run("/bin/sh", [builder, "--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /without publishing it/);
  assert.match(help.stdout, /--checksums-signature FILE/);
  assert.match(help.stdout, /--archive-gnupg-home DIR/);

  const unsigned = run("/bin/sh", [builder, "--", "unsigned.deb"]);
  assert.notEqual(unsigned.status, 0);
  assert.match(unsigned.stderr, /--checksums is required/);

  const source = await readFile(builder, "utf8");
  assert.match(source, /trap 'exit 129' HUP/);
  assert.match(source, /trap 'exit 130' INT/);
  assert.match(source, /trap 'exit 143' TERM/);
});

const integrationTools = [
  "gpg",
  "dpkg-deb",
  "dpkg-scanpackages",
  "gzip",
  "sha256sum",
  "tar",
];
const missingIntegrationTools = integrationTools.filter(
  (tool) => !commandExists(tool),
);

test(
  "APT builder authenticates inputs, signs indexes, and preserves prior output on failure",
  {
    skip: missingIntegrationTools.length
      ? `missing: ${missingIntegrationTools.join(", ")}`
      : false,
  },
  async (t) => {
    const temporary = await mkdtemp(join(tmpdir(), "graph2agent-apt-test-"));
    t.after(async () => {
      await rm(temporary, { recursive: true, force: true });
    });

    const releaseHome = join(temporary, "release-gnupg");
    const archiveHome = join(temporary, "archive-gnupg");
    const releaseFingerprint = await generateKey(
      releaseHome,
      "graph2agent release test <release-test@graph2agent.invalid>",
    );
    const archiveFingerprint = await generateKey(
      archiveHome,
      "graph2agent archive test <archive-test@graph2agent.invalid>",
    );
    assert.notEqual(releaseFingerprint, archiveFingerprint);

    const releaseKeyring = join(temporary, "release-key.asc");
    const exportedReleaseKey = runChecked("gpg", [
      "--homedir",
      releaseHome,
      "--batch",
      "--armor",
      "--export-options",
      "export-minimal",
      "--export",
      releaseFingerprint,
    ]).stdout;
    assert.match(exportedReleaseKey, /BEGIN PGP PUBLIC KEY BLOCK/);
    await writeFile(releaseKeyring, exportedReleaseKey);

    const packages = [
      await makePackage(temporary, "amd64"),
      await makePackage(temporary, "arm64"),
    ];
    const originalPackages = await Promise.all(
      packages.map((path) => readFile(path)),
    );
    const checksums = join(temporary, "checksums.txt");
    const manifest = `${(
      await Promise.all(
        packages.map(
          async (path) => `${sha256(await readFile(path))}  ${basename(path)}`,
        ),
      )
    ).join("\n")}\n`;
    await writeFile(checksums, manifest);
    const checksumsSignature = join(temporary, "checksums.txt.asc");
    runChecked("gpg", [
      "--homedir",
      releaseHome,
      "--batch",
      "--yes",
      "--pinentry-mode",
      "loopback",
      "--passphrase",
      "",
      "--local-user",
      releaseFingerprint,
      "--armor",
      "--detach-sign",
      "--output",
      checksumsSignature,
      checksums,
    ]);

    const publicDirectory = join(temporary, "public");
    const output = join(publicDirectory, "apt");
    await mkdir(publicDirectory);
    const builderArgs = [
      builder,
      "--output",
      output,
      "--base-url",
      "https://packages.graph2agent.invalid/apt",
      "--checksums",
      checksums,
      "--checksums-signature",
      checksumsSignature,
      "--release-keyring",
      releaseKeyring,
      "--release-fingerprint",
      releaseFingerprint,
      "--archive-gnupg-home",
      archiveHome,
      "--archive-fingerprint",
      archiveFingerprint,
      "--",
      ...packages,
    ];
    const built = run("/bin/sh", builderArgs);
    assert.equal(
      built.status,
      0,
      `stdout:\n${built.stdout}\nstderr:\n${built.stderr}`,
    );
    assert.match(
      built.stdout,
      /built signed APT repository for graph2agent 0\.2\.0-1/,
    );

    const releaseDirectory = join(output, "dists", "stable");
    const releaseFile = join(releaseDirectory, "Release");
    const inRelease = join(releaseDirectory, "InRelease");
    const detachedSignature = join(releaseDirectory, "Release.gpg");
    const archiveKey = join(output, "graph2agent-archive-keyring.asc");
    for (const expected of [
      releaseFile,
      inRelease,
      detachedSignature,
      archiveKey,
      join(output, "graph2agent.sources"),
      join(output, "dists", "stable", "main", "binary-amd64", "Packages"),
      join(output, "dists", "stable", "main", "binary-arm64", "Packages.gz"),
      join(
        output,
        "pool",
        "main",
        "g",
        "graph2agent",
        "graph2agent_0.2.0-1_amd64.deb",
      ),
      join(
        output,
        "pool",
        "main",
        "g",
        "graph2agent",
        "graph2agent_0.2.0-1_arm64.deb",
      ),
    ]) {
      assert.ok(
        (await readFile(expected)).length > 0,
        `missing or empty output: ${expected}`,
      );
    }

    const verificationHome = join(temporary, "verification-gnupg");
    await mkdir(verificationHome, { mode: 0o700 });
    runChecked("gpg", [
      "--homedir",
      verificationHome,
      "--batch",
      "--import",
      archiveKey,
    ]);
    runChecked("gpg", [
      "--homedir",
      verificationHome,
      "--batch",
      "--verify",
      detachedSignature,
      releaseFile,
    ]);
    const extractedRelease = join(temporary, "extracted-release");
    runChecked("gpg", [
      "--homedir",
      verificationHome,
      "--batch",
      "--output",
      extractedRelease,
      "--decrypt",
      inRelease,
    ]);
    assert.deepEqual(
      await readFile(extractedRelease),
      await readFile(releaseFile),
    );

    const releaseText = await readFile(releaseFile, "utf8");
    assert.match(releaseText, /^Origin: graph2agent$/m);
    assert.match(releaseText, /^Architectures: amd64 arm64$/m);
    const releaseChecksums = releaseText
      .split("\n")
      .slice(
        releaseText.split("\n").findIndex((line) => line === "SHA256:") + 1,
      )
      .filter((line) => line.startsWith(" "))
      .map((line) => line.trim().split(/\s+/));
    assert.equal(releaseChecksums.length, 4);
    for (const [expectedHash, expectedSize, filename] of releaseChecksums) {
      const content = await readFile(join(releaseDirectory, filename));
      assert.equal(sha256(content), expectedHash);
      assert.equal(content.length, Number(expectedSize));
    }

    for (const architecture of ["amd64", "arm64"]) {
      const binaryDirectory = join(
        releaseDirectory,
        "main",
        `binary-${architecture}`,
      );
      const plain = await readFile(join(binaryDirectory, "Packages"));
      const compressed = await readFile(join(binaryDirectory, "Packages.gz"));
      assert.deepEqual(gunzipSync(compressed), plain);
      const index = plain.toString("utf8");
      assert.match(index, /^Package: graph2agent$/m);
      assert.match(index, new RegExp(`^Architecture: ${architecture}$`, "m"));
      const filename = index.match(/^Filename: (.+)$/m)?.[1];
      const indexedHash = index.match(/^SHA256: ([0-9a-f]{64})$/m)?.[1];
      assert.ok(filename);
      assert.ok(indexedHash);
      assert.equal(sha256(await readFile(join(output, filename))), indexedHash);
    }

    assert.equal(
      await readFile(join(output, "graph2agent.sources"), "utf8"),
      [
        "Types: deb",
        "URIs: https://packages.graph2agent.invalid/apt",
        "Suites: stable",
        "Components: main",
        "Architectures: amd64 arm64",
        "Signed-By: /etc/apt/keyrings/graph2agent-archive-keyring.asc",
        "",
      ].join("\n"),
    );

    const pristineOutput = await treeDigest(output);

    await appendFile(checksums, "# unsigned mutation\n");
    const alteredManifest = run("/bin/sh", builderArgs);
    assert.notEqual(alteredManifest.status, 0);
    assert.match(
      alteredManifest.stderr,
      /checksum manifest is unsigned or its release signature is invalid/,
    );
    assert.equal(await treeDigest(output), pristineOutput);
    await writeFile(checksums, manifest);

    await appendFile(packages[0], "tampered");
    const alteredPackage = run("/bin/sh", builderArgs);
    assert.notEqual(alteredPackage.status, 0);
    assert.match(alteredPackage.stderr, /SHA-256 mismatch/);
    assert.equal(await treeDigest(output), pristineOutput);
    await Promise.all(
      packages.map((path, index) => writeFile(path, originalPackages[index])),
    );

    const unsignedArgs = builderArgs.filter(
      (value, index, values) =>
        value !== "--checksums-signature" &&
        values[index - 1] !== "--checksums-signature",
    );
    const unsignedBuild = run("/bin/sh", unsignedArgs);
    assert.notEqual(unsignedBuild.status, 0);
    assert.match(unsignedBuild.stderr, /--checksums-signature is required/);
    assert.equal(await treeDigest(output), pristineOutput);

    const wrongArchiveFingerprintArgs = builderArgs.map(
      (value, index, values) =>
        values[index - 1] === "--archive-fingerprint"
          ? releaseFingerprint
          : value,
    );
    const wrongArchiveKey = run("/bin/sh", wrongArchiveFingerprintArgs);
    assert.notEqual(wrongArchiveKey.status, 0);
    assert.match(wrongArchiveKey.stderr, /archive secret key is unavailable/);
    assert.equal(await treeDigest(output), pristineOutput);

    for (const rootOutput of ["/", "//", "///"]) {
      const rootOutputArgs = builderArgs.map((value, index, values) =>
        values[index - 1] === "--output" ? rootOutput : value,
      );
      const rootBuild = run("/bin/sh", rootOutputArgs);
      assert.notEqual(rootBuild.status, 0);
      assert.match(rootBuild.stderr, /unsafe output directory/);
      assert.equal(await treeDigest(output), pristineOutput);
    }

    const unsafeOutput = join(temporary, "unsafe-public", "apt");
    const nestedArchiveHome = join(unsafeOutput, "private-archive-gnupg");
    await mkdir(unsafeOutput, { recursive: true });
    const nestedArchiveFingerprint = await generateKey(
      nestedArchiveHome,
      "graph2agent nested archive test <nested-test@graph2agent.invalid>",
    );
    const nestedArchiveArgs = builderArgs.map((value, index, values) => {
      if (values[index - 1] === "--output") return unsafeOutput;
      if (values[index - 1] === "--archive-gnupg-home")
        return nestedArchiveHome;
      if (values[index - 1] === "--archive-fingerprint")
        return nestedArchiveFingerprint;
      return value;
    });
    const nestedArchiveBuild = run("/bin/sh", nestedArchiveArgs);
    assert.notEqual(nestedArchiveBuild.status, 0);
    assert.match(
      nestedArchiveBuild.stderr,
      /archive GnuPG home must be outside the output tree/,
    );
    const nestedKeyListing = run("gpg", [
      "--homedir",
      nestedArchiveHome,
      "--batch",
      "--with-colons",
      "--list-secret-keys",
      nestedArchiveFingerprint,
    ]);
    assert.equal(nestedKeyListing.status, 0, nestedKeyListing.stderr);
    assert.match(
      nestedKeyListing.stdout,
      new RegExp(`^fpr:+${nestedArchiveFingerprint}:`, "m"),
    );
  },
);
