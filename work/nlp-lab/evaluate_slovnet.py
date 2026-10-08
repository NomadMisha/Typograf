from pathlib import Path

from navec import Navec
from razdel import sentenize, tokenize
from slovnet import Syntax


ROOT = Path(__file__).parent
MODELS = ROOT / "models"
EMBEDDINGS = MODELS / "navec_news_v1_1B_250K_300d_100q.tar"
PARSER = MODELS / "slovnet_syntax_news_v1.tar"

# True means a comma is expected before "как"; False means it is not.
CASES = [
    ("Он сказал как эксперт.", False),
    ("Редактор объяснил как специалист.", False),
    ("Покажем как образец для команды.", False),
    ("Он сказал как это работает.", True),
    ("Мы проверили как это работает.", True),
    ("Мы проверили как автор оформил цитату.", True),
    ("В статье мы рассказали как устроена проверка.", True),
    ("Посмотрите как это работает.", True),
    ("Она сказала как будто всё уже закончено.", True),
    ("Он посмотрел на неё как на старого друга.", False),
    ("Он работает как редактор.", False),
    ("Я видел как он присел.", True),
    ("Он увидел как автор вошёл.", True),
    ("Редактор не знал как автор изменил текст.", True),
    ("Объясни как это включить.", True),
    ("Посмотрите как специалист на этот экран.", False),
    ("Мы расскажем как эксперты о проекте.", False),
    ("Как только редактор закончил, статья ушла автору.", False),
    ("Он не понимает как редактор это делает.", True),
    ("Она поняла как это работает.", True),
    ("Он поступил как настоящий профессионал.", False),
]


def main():
    embeddings = Navec.load(str(EMBEDDINGS))
    parser = Syntax.load(str(PARSER))
    parser.navec(embeddings)
    tp = fp = fn = tn = 0
    for sentence, expected in CASES:
        chunks = [[token.text for token in tokenize(part.text)] for part in sentenize(sentence)]
        predicted = False
        for markup in parser.map(chunks):
            predicted |= any(token.text.lower() == "как" and token.rel in {"mark", "cc", "fixed"} for token in markup.tokens)
        if expected and predicted:
            tp += 1
        elif predicted:
            fp += 1
        elif expected:
            fn += 1
        else:
            tn += 1
        verdict = "OK" if expected == predicted else "MISS"
        print(f"{verdict}\tneeds_comma={expected}\tpredicted={predicted}\t{sentence}")
    total = tp + fp + fn + tn
    print(f"\nTP={tp} FP={fp} FN={fn} TN={tn} exact={tp + tn}/{total}")
    print(f"precision={tp / (tp + fp):.3f}; recall={tp / (tp + fn):.3f}")


if __name__ == "__main__":
    main()
