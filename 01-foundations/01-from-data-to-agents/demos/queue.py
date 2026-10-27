"""Работающий учебный пример; номера заявок не являются производственными данными.

Запуск: python3 queue.py
"""

import csv
from pathlib import Path


def unique(xs):
    return list(dict.fromkeys(xs))


if __name__ == "__main__":
    with Path(__file__).with_name("tickets.csv").open() as source:
        tickets = [int(row["ticket_id"]) for row in csv.DictReader(source)]
    expected = [1047, 1042, 1051]
    actual = unique(tickets)
    assert actual == expected
    assert unique([]) == []
    assert unique([1047, 1047]) == [1047]
    assert sorted(set(tickets)) != expected
    print("Вход:", tickets)
    print("Сохранили очередь:", actual)
    print("Сортировка нарушает очередь:", sorted(set(tickets)))
    print("Все четыре проверки пройдены.")
