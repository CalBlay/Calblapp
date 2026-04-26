import test from "node:test";
import assert from "node:assert/strict";
import { isMlLearningFirestoreSinkEnabled } from "../src/services/ml-learning.service.js";

const KEYS = [
  "ML_LEARNING_USE_FIRESTORE",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY"
];

function snapshotEnv() {
  const s = {};
  for (const k of KEYS) s[k] = process.env[k];
  return s;
}

function restoreEnv(snap) {
  for (const k of KEYS) {
    if (snap[k] === undefined) delete process.env[k];
    else process.env[k] = snap[k];
  }
}

test("isMlLearningFirestoreSinkEnabled: explicit 0 overrides firebase env", () => {
  const snap = snapshotEnv();
  try {
    process.env.ML_LEARNING_USE_FIRESTORE = "0";
    process.env.FIREBASE_PROJECT_ID = "p";
    process.env.FIREBASE_CLIENT_EMAIL = "e@x";
    process.env.FIREBASE_PRIVATE_KEY = "k";
    assert.equal(isMlLearningFirestoreSinkEnabled(), false);
  } finally {
    restoreEnv(snap);
  }
});

test("isMlLearningFirestoreSinkEnabled: auto on when firebase triplet set and flag unset", () => {
  const snap = snapshotEnv();
  try {
    delete process.env.ML_LEARNING_USE_FIRESTORE;
    process.env.FIREBASE_PROJECT_ID = "p";
    process.env.FIREBASE_CLIENT_EMAIL = "e@x";
    process.env.FIREBASE_PRIVATE_KEY = "k";
    assert.equal(isMlLearningFirestoreSinkEnabled(), true);
  } finally {
    restoreEnv(snap);
  }
});

test("isMlLearningFirestoreSinkEnabled: false without firebase when flag unset", () => {
  const snap = snapshotEnv();
  try {
    delete process.env.ML_LEARNING_USE_FIRESTORE;
    delete process.env.FIREBASE_PROJECT_ID;
    delete process.env.FIREBASE_CLIENT_EMAIL;
    delete process.env.FIREBASE_PRIVATE_KEY;
    assert.equal(isMlLearningFirestoreSinkEnabled(), false);
  } finally {
    restoreEnv(snap);
  }
});
