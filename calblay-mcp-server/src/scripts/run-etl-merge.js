/**
 * ETL fusionat: traces/feedback de Firestore + fitxers locals (JSONL).
 * Útil per combinar producció (núvol) amb proves locals.
 */
process.env.ML_LEARNING_ETL_MERGE = "1";
await import("./ml-learning-etl.js");
