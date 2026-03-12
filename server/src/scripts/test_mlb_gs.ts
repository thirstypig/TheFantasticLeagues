

async function fetchGrandSlams(mlbId: string, season: number) {
  // Try 'statSplits' without sitCodes to see everything, or use sitCodes for Bases Loaded.
  // Bases Loaded code might be 'r123' or similar.
  // Let's try fetching ALL splits for the season.
  
  const url = `https://statsapi.mlb.com/api/v1/people/${mlbId}/stats?stats=statSplits&group=hitting&season=${season}`;

  console.log(`Fetching: ${url}`);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const data = await res.json();
    
    const splits = data.stats?.[0]?.splits;
    if (!splits) {
         console.log("No splits found");
         return;
    }
    
    console.log(`Found ${splits.length} splits.`);
    // Print descriptions of first 5 and any that match 'loaded'
    splits.forEach((s: any, i: number) => {
        const desc = s.split?.description || 'No Description';
        if (i < 5) console.log(`Split ${i}: ${desc}`);
        if (desc.toLowerCase().includes('loaded')) {
             console.log(`MATCH: ${desc} -> HR: ${s.stat.homeRuns}`);
        }
    });

  } catch (e: unknown) {
    console.error("Error:", e instanceof Error ? e.message : String(e));
  }
}


// Test with Royce Lewis (Twins) - ID: 668904
// 2023 or 2024 (he hit lots of GS in 2023)
const ROYCE_LEWIS_ID = '668904'; 
console.log("Testing with Royce Lewis (2023)...");
fetchGrandSlams(ROYCE_LEWIS_ID, 2023);
