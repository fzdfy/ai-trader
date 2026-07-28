import { db } from "../../../db";

export const newsPipe = {
  async run() {
    console.log("[news] running...");
    // TODO: fetch latest news, deduplicate, extract symbols
    console.log("[news] done");
  },
};
