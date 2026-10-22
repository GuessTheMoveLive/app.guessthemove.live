Status: resolved
Type: grilling

## Question

How does a Participant actually enter a Guess and build an Analysis Tree on their phone, and how does submission timing work between the two?

## Answer

**Guess entry**: tap the origin square, then the destination square, on the empty coordinate board; the server validates legality against the actual position.

**Analysis Tree entry**: the same tap-based origin/destination entry extends into a tree — tapping origin/destination on the current line creates or extends a variation (including sub-variations), and the Participant can tap into an existing branch to add further continuations from there. At the end of each variation, the Participant picks its Assessment Symbol from a fixed set (`+-`, `±`, `=`, `∓`, `-+`).

**Submission flow**: the main Guess locks in as soon as it's entered (so correctness/Guess Score is anchored to what was actually first committed), but the Analysis Tree can keep growing after that, right up until the Host triggers Reveal.

The exact on-screen layout/affordances for building a tree of arbitrary depth on a small screen are left to [Analysis tree phone input UI](../issues/14-analysis-tree-phone-ui-prototype.md) (prototype).
