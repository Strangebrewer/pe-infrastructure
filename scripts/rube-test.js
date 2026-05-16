import express from "express";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";

const app = express();
const PORT = 3099;

const SET_A = [
  "gravity",
  "inequality",
  "vapor",
  "tidal",
  "poverty",
  "mineral",
  "eclipse",
  "migration",
  "erosion",
  "lattice",
  "mortality",
  "sediment",
  "solvent",
  "literacy",
  "current",
  "orbital",
  "urbanization",
  "pressure",
  "cascade",
  "fertility",
  "basin",
  "ferment",
  "governance",
  "aquifer",
  "inflation",
];

const SET_B = [
  "isomer",
  "biodiversity",
  "welfare",
  "thermal",
  "unemployment",
  "salinity",
  "radiation",
  "democracy",
  "tectonic",
  "entropy",
  "catalyst",
  "education",
  "glacial",
  "polymer",
  "sanitation",
  "seismic",
  "isotope",
  "volcanic",
  "healthcare",
  "drought",
  "plasma",
  "nutrition",
  "deforestation",
  "conflict",
];

const SET_C = [
  "velocity",
  "refraction",
  "trade",
  "emissions",
  "rainfall",
  "magnetic",
  "energy",
  "watershed",
  "acoustic",
  "agriculture",
  "corruption",
  "coral",
  "kinetic",
  "population",
  "flux",
  "permafrost",
  "nuclear",
  "housing",
  "methane",
  "photon",
  "income",
  "nitrogen",
  "spectrum",
  "carbon",
  "diffusion",
  "altitude",
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

app.get("/rube", async (req, res) => {
  const words = [pick(SET_A), pick(SET_B), pick(SET_C)];
  const word = pick(words);
  console.log("word:", word);

  const indicatorsUrl = `https://search.owid.io/indicators?query=${word}`;
  const indicatorsResp = await fetch(indicatorsUrl);
  const indicatorsData = await indicatorsResp.json();

  const results = indicatorsData.results;
  if (!results?.length) {
    console.log("no indicators found");
    return res.status(500).json({ error: "no indicators found", words });
  }

  for (let i = 0; i < results.length; i++) {
    const indicator = results[i];
    console.log(
      `trying indicator ${i + 1}/${results.length}:`,
      indicator.title,
    );
    const searchUrl = `https://ourworldindata.org/api/search?q=${encodeURIComponent(indicator.title)}`;
    const searchResp = await fetch(searchUrl);
    const searchData = await searchResp.json();
    const hits = searchData.results;
    if (hits?.length) {
      const hitIndex = Math.floor(Math.random() * hits.length);
      const hit = hits[hitIndex];
      const tracking = {
        indicatorsTried: i + 1,
        searchHits: hits.length,
        hitIndex,
      };
      console.log("result:", hit.url, tracking);
      return res.json({ title: hit.title, link: hit.url, tracking });
    }
    console.log(`no results for indicator ${i + 1}:`, indicator.title);
  }

  console.log("exhausted all indicators");
  res.status(500).json({ error: "no search results for any indicator", words });
});

async function indicatorsSearch(word) {
  const indicatorsResp = await fetch(
    `https://search.owid.io/indicators?query=${word}`,
  );
  const indicatorsData = await indicatorsResp.json();
  const indicators = indicatorsData.results;
  if (!indicators?.length) return null;

  for (let i = 0; i < indicators.length; i++) {
    const indicator = indicators[i];
    console.log(
      `trying indicator ${i + 1}/${indicators.length}:`,
      indicator.title,
    );
    const searchResp = await fetch(
      `https://ourworldindata.org/api/search?q=${encodeURIComponent(indicator.title)}`,
    );
    const searchData = await searchResp.json();
    const hits = searchData.results;
    if (hits?.length) {
      const hitIndex = Math.floor(Math.random() * hits.length);
      return {
        hit: hits[hitIndex],
        tracking: {
          path: "indicators",
          indicatorsTried: i + 1,
          searchHits: hits.length,
          hitIndex,
        },
      };
    }
    console.log(`no results for indicator ${i + 1}:`, indicator.title);
  }
  return null;
}

async function directSearch(word) {
  console.log("trying direct search for:", word);
  const resp = await fetch(
    `https://ourworldindata.org/api/search?q=${encodeURIComponent(word)}`,
  );
  const data = await resp.json();
  const hits = data.results;
  if (!hits?.length) return null;
  const hitIndex = Math.floor(Math.random() * hits.length);
  return {
    hit: hits[hitIndex],
    tracking: { path: "direct", searchHits: hits.length, hitIndex },
  };
}

app.get("/rube/:word", async (req, res) => {
  const word = req.params.word;
  console.log("word:", word);

  const useIndicatorsFirst = Math.random() < 0.5;
  console.log(
    "strategy:",
    useIndicatorsFirst ? "indicators-first" : "direct-first",
  );

  const strategies = useIndicatorsFirst
    ? [() => indicatorsSearch(word), () => directSearch(word)]
    : [() => directSearch(word), () => indicatorsSearch(word)];

  let result = await strategies[0]();
  if (!result) {
    console.log("first path exhausted, trying fallback");
    result = await strategies[1]();
  }

  if (!result) {
    return res.status(500).json({ error: "no results from either path", word });
  }

  console.log("result:", result.hit.url, result.tracking);
  res.json({
    title: result.hit.title,
    link: result.hit.url,
    tracking: result.tracking,
  });
});

async function testWord(word) {
  const indicatorsResp = await fetch(
    `https://search.owid.io/indicators?query=${word}`,
  );
  const indicatorsData = await indicatorsResp.json();
  const indicators = indicatorsData.results;
  if (!indicators?.length) return false;

  for (const indicator of indicators) {
    const searchResp = await fetch(
      `https://ourworldindata.org/api/search?q=${encodeURIComponent(indicator.title)}`,
    );
    const searchData = await searchResp.json();
    if (searchData.results?.length) return true;
  }
  return false;
}

function serializeSet(name, arr) {
  return `const ${name} = [\n${arr.map((w) => `  "${w}",`).join("\n")}\n];`;
}

app.get("/audit", async (req, res) => {
  const sets = { SET_A, SET_B, SET_C };
  const removed = { SET_A: [], SET_B: [], SET_C: [] };

  for (const [setName, words] of Object.entries(sets)) {
    for (const word of words) {
      const passed = await testWord(word);
      if (passed) {
        console.log(`PASS: ${word}`);
      } else {
        console.log(`FAIL: ${word}`);
        removed[setName].push(word);
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  const filePath = fileURLToPath(import.meta.url);
  let content = readFileSync(filePath, "utf8");

  const newSets = {
    SET_A: SET_A.filter((w) => !removed.SET_A.includes(w)),
    SET_B: SET_B.filter((w) => !removed.SET_B.includes(w)),
    SET_C: SET_C.filter((w) => !removed.SET_C.includes(w)),
  };

  for (const name of ["SET_A", "SET_B", "SET_C"]) {
    content = content.replace(
      new RegExp(`const ${name} = \\[[\\s\\S]*?\\];`),
      serializeSet(name, newSets[name]),
    );
  }

  writeFileSync(filePath, content, "utf8");

  res.json({
    removed,
    remaining: {
      SET_A: newSets.SET_A.length,
      SET_B: newSets.SET_B.length,
      SET_C: newSets.SET_C.length,
    },
  });
});

app.listen(PORT, () => console.log(`rube test server running on port ${PORT}`));
