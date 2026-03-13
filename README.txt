
# script.v2.js (patched)

This is a drop-in patched script that fixes the invalid regex (`split(/?/ )`) and adds a robust
splitter + greedy keeper pairing for K=1 so that no candidate ends up with zero keeper halves when all want to play GK.

## What changed
- Replaced `split(/?/ )` with `splitList()` using a safe regex and text sanitizer.
- Added `keeperPairsGreedy()` for fair distribution under the "no consecutive keeper matches" rule.
- Exposed a small API on `window.TeamPlannerB` for easy integration.

## Quick use
```html
<script src="script.v2.js"></script>
<script>
  // From inputs
  var players = TeamPlannerB.splitList('Åshild, Lykke, Ida, Mille, Tara');
  var wants   = TeamPlannerB.splitList('Åshild, Lykke, Ida, Tara');
  var plan    = TeamPlannerB.planB(players, wants, 4, 15, 1, true);
  TeamPlannerB.render(plan); // if the page has #summary, #schedules etc.
</script>
```

If your page uses buttons/inputs with ids `pNames, pGK, cnt, dur, K, noConsec`,
you can simply call `TeamPlannerB.attachUI()` after loading the script.
