/**
 * ETL des de Firestore (ML_LEARNING_USE_FIRESTORE=1 al MCP).
 * Requereix les mateixes variables Firebase Admin que el servidor.
 */
process.env.ML_LEARNING_ETL_SOURCE = "firestore";
await import("./ml-learning-etl.js");
