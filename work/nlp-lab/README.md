# Slovnet syntax-analysis trial

This is an isolated trial, not a dependency of Typograf. It evaluates whether a Russian dependency parser can safely identify the comma before `как`.

## Setup

Python 3.9+:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Model assets are from the official [Slovnet](https://github.com/natasha/slovnet) and [Navec](https://github.com/natasha/navec) project links, stored under `models/`.

## Result

Run `.venv/bin/python evaluate_slovnet.py`. On 21 deliberately contrasting examples, a conservative `как → mark` heuristic reached TP=7, FP=1, FN=5, TN=8 (15/21 exact; precision 0.875; recall 0.583). It distinguishes `как эксперт` from `как это работает` in several examples, but misses subordinate clauses with a lexical subject, misses `как устроена проверка`, and mistakes `как только` for a comma case.

Conclusion: do not use this heuristic to add commas or wire it into the editor yet. It can serve as research input for a future review-only helper after a larger Habr-style gold set demonstrates useful coverage. It does not itself correct text.

The source repository reports a small news-oriented syntax model and notes weaker parsing outside news. Its published syntax UAS/LAS for news is 0.907/0.880; these are parser metrics, not punctuation-correction accuracy.
