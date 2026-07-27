export const CONTROL_HELP = Object.freeze({
  "colony-canvas":
    "Select a node to inspect it. Use the arrow keys to move between nodes and Enter to place food while moving it.",
  "cancel-food-move": "Stop moving the selected food source without changing the map.",
  "toggle-run": "Pause or resume the colony without resetting ants or pheromones.",
  "step-once": "Advance the simulation by one small fixed step while paused.",
  "new-graph": "Generate the next seeded graph using the staged graph settings.",
  "reset-run": "Restart every ant and clear both pheromone fields on this graph.",
  "clear-trails":
    "Clear both pheromone fields while leaving ants and endpoints in place.",
  "copy-share-link":
    "Copy a URL containing the current algorithm, graph recipe, hill, and food sources.",
  engineId:
    "Choose a source revision to run on this exact graph. Switching resets ants and trails while preserving the graph, hill, and placed food.",
  simulationRate:
    "Run the whole simulation clock faster or slower, including movement, pheromone decay, and per-second decisions. This changes only playback rate.",
  antCount:
    "Change the live population. Added ants start at the hill; existing ants and trails remain.",
  speed:
    "Set one physical speed for every ant. Long edges take proportionally longer to cross.",
  "algorithm-preset-name": "Name the current collection of ant-decision settings.",
  "save-algorithm-preset":
    "Save only the ant-decision settings under the entered name in this browser.",
  "algorithm-presets":
    "Choose a tested built-in algorithm or an ant-decision configuration saved in this browser.",
  "load-algorithm-preset":
    "Apply the selected built-in or saved ant settings without resetting the graph, ants, or trails.",
  "delete-algorithm-preset":
    "Delete the selected personal ant-settings preset; built-in presets are immutable.",
  exploreRate:
    "Chance that a normal searching ant switches into random scouting at each junction.",
  stopExploreChance:
    "Per-second chance that a scouting ant returns to normal trail following; independent of frame rate.",
  exploreSignalBias:
    "After every adjacent branch is charted, bias scouts by persistent signal at the opposite endpoint: negative avoids it, zero chooses randomly, positive seeks it.",
  unchartedPreference:
    "Reduce the weight of charted branches when a zero-coverage endpoint is locally available. At 100%, scouts choose only among uncharted options.",
  reversePenalty:
    "Weight for immediately reversing onto the previous node. Lower values discourage one-edge backtracking.",
  headingInfluence:
    "Favor branches that continue the ant’s incoming heading using only local junction geometry.",
  distanceInfluence:
    "Favor shorter adjacent edges. Zero ignores edge length; higher values strengthen the preference.",
  choiceFloor:
    "Relative base weight retained for an unmarked branch when another option has signal. Zero forbids the deviation; higher values permit error correction.",
  foodTrailModel:
    "Store food pheromone as scalar node levels with derived slopes, or on undirected edges with no stored direction. Switching preserves both live fields.",
  fastInfluence:
    "Outbound attraction to food-signal strength at each branch’s opposite endpoint.",
  outboundPolarity:
    "Outbound response to food-signal slope: negative descends it, zero ignores slope, positive climbs it.",
  returnFastInfluence:
    "Homebound attraction to food-signal strength at each branch’s opposite endpoint.",
  returnSlowInfluence:
    "Homebound attraction to persistent-signal strength at each branch’s opposite endpoint.",
  returnFastPolarity:
    "Homebound response to food-signal slope: negative descends it, zero ignores slope, positive climbs it.",
  returnSlowPolarity:
    "Homebound response to persistent-signal slope: negative descends it, zero ignores slope, positive climbs it.",
  slowHalfLife: "Seconds for an unreinforced persistent-signal level to decay by half.",
  fastHalfLife: "Seconds for an unreinforced food-signal level to decay by half.",
  nodeCount: "Number of nodes to create on the next generated or loaded-seed graph.",
  density:
    "Amount of extra connectivity beyond the guaranteed spanning backbone on the next graph.",
  mapVariation:
    "Spatial and topological temperature for the next graph: low is even and local; high adds clustering, bottlenecks, and occasional long links.",
  seed:
    "Deterministic graph seed. The same seed and graph settings reproduce the same map.",
  "load-seed": "Rebuild the graph from the entered seed and staged graph settings.",
  "map-preset-name":
    "Name the current graph recipe, hill, and food-source arrangement.",
  "save-map-preset":
    "Save only the current map recipe and endpoints under the entered name in this browser.",
  "map-presets": "Choose a saved map configuration.",
  "load-map-preset": "Rebuild the selected map with the current ant-decision settings.",
  "delete-map-preset": "Delete the selected map preset from this browser.",
  "show-ants": "Show or hide ants without changing the simulation.",
  "show-trails": "Show or hide both pheromone fields without changing them.",
  "show-labels": "Show or hide ordinary node labels; endpoint labels remain visible.",
  "set-hill":
    "Move the hill to the selected node and restart the colony on this graph.",
  "add-food":
    "Add another food source at the selected node without resetting the colony.",
  "move-food":
    "Choose a new node for this food source while ants and trails keep running.",
  "remove-food": "Remove this food source; at least one food source must remain.",
});
