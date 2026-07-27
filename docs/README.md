# Formic research library

This is a focused reading set for the biological and algorithmic decisions in Formic.
Papers are grouped by the question they help answer rather than by publication date.

The local PDFs came from the publisher, a public research repository, or an
author/institutional distribution page. Copyright and license terms remain with their
authors and publishers. The source link beside each file is the authority for reuse
terms and newer versions.

## Suggested reading paths

- **Pheromone channels and decay:** Dussutour, then Robinson.
- **Local choice and trail shape:** Perna, Garnier, then Sakamoto.
- **Homing and error correction:** Ribeiro, Czaczkes, then Chandrasekhar.
- **Shortest-path algorithms:** Garg, then Dorigo and Stützle for the deliberately less
  biological ACO comparison.

## Papers stored here

### Pheromone channels, decay, and local response

- **Dussutour, Nicolis, Shephard, Beekman & Sumpter (2009), “The role of multiple
  pheromones in food recruitment by ants.”** The main empirical basis for distinguishing
  a persistent exploration signal from a shorter-lived, stronger food-recruitment
  signal. DOI [10.1242/jeb.029827](https://doi.org/10.1242/jeb.029827), PMID 19617426.
  [Local PDF](papers/2009-dussutour-multiple-pheromones.pdf) ·
  [author source](http://dussutou.free.fr/Multiple%20pheromones%202009%20JEB.pdf)

- **Robinson, Green, Jenner, Holcombe & Ratnieks (2008), “Decay rates of attractive and
  repellent pheromones in an ant foraging trail network.”** Useful when choosing
  half-lives and when considering whether an avoidance channel belongs in the model. DOI
  [10.1007/s00040-008-0994-5](https://doi.org/10.1007/s00040-008-0994-5).
  [Local PDF](papers/2008-robinson-pheromone-decay.pdf) ·
  [White Rose repository](https://eprints.whiterose.ac.uk/id/eprint/46214/)

- **Perna et al. (2012), “Individual Rules for Trail Pattern Formation in Argentine
  Ants.”** Measures a local Weber-law-like response to the relative difference in
  pheromone concentration. This directly motivates Formic’s normalized endpoint slope.
  DOI [10.1371/journal.pcbi.1002592](https://doi.org/10.1371/journal.pcbi.1002592),
  PMCID PMC3400603. [Local PDF](papers/2012-perna-individual-trail-rules.pdf) ·
  [PLOS source](https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1002592)

### Direction, geometry, and error correction

- **Sakamoto & Sakiyama (2022), “Ant Lasius niger joining one-way trails go against the
  flow.”** Shows that naïve joiners initially choose a direction randomly and that
  encounters with traffic can change the result. It is a useful warning against treating
  an undirected concentration as a destination label. DOI
  [10.1038/s41598-022-05879-4](https://doi.org/10.1038/s41598-022-05879-4), PMCID
  PMC8837658. [Local PDF](papers/2022-sakamoto-one-way-trails.pdf) ·
  [Nature source](https://www.nature.com/articles/s41598-022-05879-4)

- **Ribeiro et al. (2009), “Ants Can Learn to Forage on One-Way Trails.”** Examines
  traffic encounters as a directional cue and provides a useful contrast with Formic’s
  pheromone-only invariant. DOI
  [10.1371/journal.pone.0005024](https://doi.org/10.1371/journal.pone.0005024), PMCID
  PMC2659768. [Local PDF](papers/2009-ribeiro-one-way-trail-learning.pdf) ·
  [PLOS source](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0005024)

- **Czaczkes, Grüter, Ellis, Wood & Ratnieks (2013), “Ant foraging on complex trails:
  route learning and the role of trail pheromones in Lasius niger.”** Covers
  route-learning errors, error-triggered deposition, and suppression of deposition on
  already strong trails. It is especially relevant to future error-correction controls,
  even though Formic intentionally omits route memory. DOI
  [10.1242/jeb.076570](https://doi.org/10.1242/jeb.076570), PMID 22972897.
  [Local PDF](papers/2013-czaczkes-complex-trails.pdf) ·
  [author source](https://www.socialinsect-research.com/resources/Publications/Czaczkesetal.2013.pdf)

- **Garnier, Combe, Jost & Theraulaz (2013), “Do Ants Need to Estimate the Geometrical
  Properties of Trail Bifurcations to Find an Efficient Route? A Swarm Robotics Test
  Bed.”** Isolates what local junction geometry can accomplish without sophisticated
  cognition. DOI
  [10.1371/journal.pcbi.1002903](https://doi.org/10.1371/journal.pcbi.1002903), PMCID
  PMC3610605. [Local PDF](papers/2013-garnier-bifurcation-geometry.pdf) ·
  [PLOS source](https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1002903)

- **Chandrasekhar, Gordon & Navlakha (2018), “A distributed algorithm to maintain and
  repair the trail networks of arboreal ants.”** Directly relevant to dead ends and
  local repair: the observed rule avoids reinforcing a return from a failed branch. DOI
  [10.1038/s41598-018-27160-3](https://doi.org/10.1038/s41598-018-27160-3), PMCID
  PMC6006367. [Local PDF](papers/2018-chandrasekhar-trail-repair.pdf) ·
  [Nature source](https://www.nature.com/articles/s41598-018-27160-3)

### Shortest paths and artificial ant systems

- **Garg, Shiragur, Gordon & Charikar (2023), “Distributed algorithms from arboreal ants
  for the shortest path problem.”** A bridge between observed local ant behavior and
  formal shortest-path guarantees. DOI
  [10.1073/pnas.2207959120](https://doi.org/10.1073/pnas.2207959120), PMCID PMC9963535.
  [Local PDF](papers/2023-garg-distributed-shortest-path.pdf) ·
  [NSF repository](https://par.nsf.gov/biblio/10424543)

- **Dorigo, Maniezzo & Colorni (1996), “Ant System: Optimization by a Colony of
  Cooperating Agents.”** The canonical artificial-ant algorithm. Its tour-level memory
  and global reinforcement are useful comparison points, but they are intentionally
  outside Formic’s local biological rules. DOI
  [10.1109/3477.484436](https://doi.org/10.1109/3477.484436).
  [Local PDF](papers/1996-dorigo-ant-system.pdf) ·
  [IRIDIA author archive](https://iridia.ulb.ac.be/~mdorigo/Published_papers/All_Dorigo_papers/DorManCol1996tsmcb.pdf)

- **Stützle & Dorigo (2002), “A Short Convergence Proof for a Class of Ant Colony
  Optimization Algorithms.”** Clarifies which bounded-pheromone and best-so-far
  reinforcement assumptions are needed for convergence claims; those assumptions should
  not be silently attributed to biological ants. DOI
  [10.1109/TEVC.2002.802444](https://doi.org/10.1109/TEVC.2002.802444).
  [Local PDF](papers/2002-stutzle-aco-convergence.pdf) ·
  [IRIDIA author archive](https://iridia.ulb.ac.be/~mdorigo/Published_papers/All_Dorigo_papers/StuDor2002tec.pdf)

## Relevant references not duplicated locally

These are important enough to keep in the reading map, but the available copy is
subscription-only, free-to-read without a reusable archive package, or an offprint whose
terms do not permit reposting.

- **Jackson, Holcombe & Ratnieks (2004), “Trail geometry gives polarity to ant foraging
  networks.”** The README-cited geometry result. DOI
  [10.1038/nature03105](https://doi.org/10.1038/nature03105).
- **Dussutour, Beekman, Nicolis & Meyer (2009), “Noise improves collective
  decision-making by ants in dynamic environments.”** Strong support for a tunable
  probability of deviating from the established trail. DOI
  [10.1098/rspb.2009.1235](https://doi.org/10.1098/rspb.2009.1235),
  [free PMC text](https://pmc.ncbi.nlm.nih.gov/articles/PMC2817102/).
- **Czaczkes, Grüter, Jones & Ratnieks (2011), “Synergy between social and private
  information increases foraging efficiency in ants.”** A useful contrast with a model
  that bans route memory. DOI
  [10.1098/rsbl.2011.0067](https://doi.org/10.1098/rsbl.2011.0067),
  [free PMC text](https://pmc.ncbi.nlm.nih.gov/articles/PMC3130237/).
- **Reid, Latty & Beekman (2012), “Making a trail: informed Argentine ants lead colony
  to the best food by U-turning coupled with enhanced pheromone laying.”** Food-to-nest
  trail construction and temporary U-turn behavior. DOI
  [10.1016/j.anbehav.2012.09.036](https://doi.org/10.1016/j.anbehav.2012.09.036).
- **Beckers, Deneubourg & Goss (1992), “Trails and U-turns in the selection of a path by
  the ant Lasius niger.”** A classic warning that shorter-route selection depends on
  geometry and U-turn behavior, not only lap frequency. DOI
  [10.1016/S0022-5193(05)80686-1](https://doi.org/10.1016/S0022-5193(05)80686-1).
- **Goss, Aron, Deneubourg & Pasteels (1989), “Self-organized shortcuts in the Argentine
  ant.”** The foundational unequal-bridge shortcut experiment. DOI
  [10.1007/BF00462870](https://doi.org/10.1007/BF00462870).
- **Deneubourg, Aron, Goss & Pasteels (1990), “The self-organizing exploratory pattern
  of the Argentine ant.”** A foundational stochastic exploration and trail-formation
  model. DOI
  [10.1016/0022-5193(90)90025-U](https://doi.org/10.1016/0022-5193(90)90025-U).
- **Czaczkes, Grüter & Ratnieks (2015), “Trail Pheromones: An Integrative View of Their
  Role in Social Insect Colony Organization.”** Broad review of deposition, following,
  memory, negative feedback, and species differences. DOI
  [10.1146/annurev-ento-010814-020627](https://doi.org/10.1146/annurev-ento-010814-020627).
- **Saund & Friedman (2023), “A single-pheromone model accounts for empirical patterns
  of ant colony foraging previously modeled using two pheromones.”** A useful competing
  interpretation of the Dussutour results. DOI
  [10.1016/j.cogsys.2023.02.005](https://doi.org/10.1016/j.cogsys.2023.02.005).

The non-paper background page cited by the project remains
[Trail pheromone](https://en.wikipedia.org/wiki/Trail_pheromone).
