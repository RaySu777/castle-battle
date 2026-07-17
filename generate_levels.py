#!/usr/bin/env python3
"""Generate levels for 城堡大战."""

import re

# 100 mini-section theme pairs (10 levels each, 1000 levels total)
THEME_PAIRS = [
    ('玄黄', '洪荒'), ('紫霄', '碧落'), ('九幽', '黄泉'), ('归墟', '寂灭'), ('太易', '太初'),
    ('太上', '玉清'), ('元始', '灵宝'), ('道德', '上清'), ('先天', '后天'), ('阴阳', '五行'),
    ('乾坤', '造化'), ('日月', '星辰'), ('山河', '社稷'), ('风云', '雷霆'), ('霜雪', '寒冰'),
    ('烈焰', '焚天'), ('沧海', '桑田'), ('蓬莱', '方丈'), ('瀛洲', '昆仑'), ('瑶池', '弱水'),
    ('天河', '银汉'), ('北斗', '南斗'), ('东华', '西王'), ('真武', '玄天'), ('紫薇', '天枢'),
    ('太乙', '玄都'), ('洞玄', '洞神'), ('洞真', '上阳'), ('赤城', '金庭'), ('玉京', '金阙'),
    ('玄都', '紫府'), ('青华', '宝诰'), ('长生', '度厄'), ('消灾', '解厄'), ('延生', '保命'),
    ('文昌', '武曲'), ('巨门', '贪狼'), ('破军', '七杀'), ('廉贞', '天府'), ('天相', '天梁'),
    ('天同', '天机'), ('天魁', '天钺'), ('左辅', '右弼'), ('禄存', '天马'), ('擎羊', '陀罗'),
    ('火星', '铃星'), ('地空', '地劫'), ('红鸾', '天喜'), ('孤辰', '寡宿'), ('华盖', '咸池'),
    ('劫煞', '亡神'), ('将星', '攀鞍'), ('岁驿', '晦气'), ('病符', '吊客'), ('白虎', '丧门'),
    ('贯索', '官符'), ('小耗', '大耗'), ('龙德', '紫微'), ('天德', '月德'), ('福星', '禄神'),
    ('财神', '喜神'), ('贵神', '胎神'), ('岁破', '月破'), ('日破', '时破'), ('天罗', '地网'),
    ('飞廉', '大耗'), ('伏兵', '剑锋'), ('太岁', '岁君'), ('青龙', '朱雀'), ('玄武', '勾陈'),
    ('腾蛇', '六合'), ('太阴', '太阳'), ('天乙', '玉堂'), ('金门', '天赦'), ('天官', '天福'),
    ('天厨', '天财'), ('天寿', '天贵'), ('恩光', '天巫'), ('天医', '天刑'), ('天姚', '天虚'),
    ('天哭', '天月'), ('阴煞', '阳煞'), ('流霞', '红艳'), ('八座', '三台'), ('封诰', '诰命'),
    ('皇恩', '国印'), ('天印', '天恩'), ('解神', '天解'), ('月空', '日空'), ('截路', '空亡'),
    ('旬空', '伏吟'), ('反吟', '天转'), ('地转', '天伤'), ('地伤', '天刑'), ('地刑', '天罗'),
    ('混元', '太虚'), ('无上', '至尊'), ('终极', '归墟'), ('万道', '归一'), ('诸天', '至尊'),
]

SUFFIXES = [
    None,  # 0: combined
    '门槛', '前哨', '神域', '圣城', '天界', '神宫', '圣域', '神域', '审判', None
]

# For offset 0: use combined name
# For offset 1,3,5,7,9: themeA + suffix
# For offset 2,4,6,8: themeB + suffix (but offset 2 is 前哨 with themeB, etc.)

OFFSET_THEME = [0, 0, 1, 0, 1, 0, 1, 0, 1, 0]  # 0=themeA, 1=themeB
OFFSET_SUFFIX = ['', '门槛', '前哨', '神域', '圣城', '天界', '神宫', '圣域', '神域', '审判']

GENERIC_DESCRIPTIONS = [
    '敌军越战越勇，每一秒都至关重要。',
    '七路大军列阵，攻势排山倒海。',
    '吞噬一切秩序，疯狂反扑。',
    '战力登峰造极，不可力敌只能智取。',
    '敌军火力达到顶峰，每一波都是生死考验。',
    '守军超越寂灭轮回，开局即面临极限压力。',
    '双骑士开路，法师远程压制，攻势连绵不绝。',
    '双法师齐射，投石车轰炸无休，远程火力恐怖。',
    '六路精锐无休进攻，需持续出兵压制敌方。',
    '双法师双投石车齐攻，火力登峰造极。',
    '三投石车齐射，城堡危在旦夕，保护我方城堡！',
    '困住千军，唯有强攻方可破局。',
    '双投石车封锁战场，必须快速推进战线。',
    '三骑士冲锋势不可挡，必须稳固前线才能反击。',
    '时空扭曲出兵极快，敌军轮换毫无间隙。',
    '七路大军压境而来，压迫感前所未有。',
    '守军近乎不死，需以快制慢，速战速决。',
    '三法师覆盖全场，远程火力毁天灭地。',
    '六兵种齐备，阵容毫无短板，不可掉以轻心。',
]

UNIT_TEMPLATES = [
    "['catapult', 'catapult', 'catapult', 'mage', 'mage', 'mage', 'knight', 'knight', 'knight']",
    "['catapult', 'catapult', 'mage', 'mage', 'knight', 'knight', 'catapult']",
    "['mage', 'catapult', 'knight', 'knight', 'mage', 'archer']",
    "['catapult', 'mage', 'knight', 'knight', 'catapult', 'warrior']",
    "['catapult', 'catapult', 'mage', 'mage', 'knight', 'archer']",
    "['catapult', 'mage', 'mage', 'knight', 'knight', 'catapult']",
    "['catapult', 'catapult', 'mage', 'mage', 'knight', 'knight', 'archer']",
    "['mage', 'mage', 'mage', 'knight', 'catapult', 'archer']",
    "['catapult', 'catapult', 'catapult', 'mage', 'knight']",
    "['knight', 'knight', 'knight', 'mage', 'catapult', 'archer']",
    "['catapult', 'mage', 'mage', 'knight', 'knight', 'catapult', 'archer']",
    "['catapult', 'catapult', 'mage', 'mage', 'mage', 'knight']",
    "['catapult', 'catapult', 'catapult', 'mage', 'mage', 'knight']",
    "['catapult', 'mage', 'mage', 'knight', 'knight', 'knight', 'archer']",
    "['catapult', 'catapult', 'mage', 'mage', 'knight', 'knight', 'warrior']",
    "['catapult', 'catapult', 'catapult', 'mage', 'mage', 'mage', 'knight', 'knight', 'knight', 'archer']",
    "['catapult', 'catapult', 'catapult', 'mage', 'mage', 'mage', 'knight', 'knight', 'knight', 'warrior']",
    "['warrior', 'knight', 'mage', 'catapult', 'archer']",
    "['knight', 'knight', 'mage', 'catapult', 'archer']",
    "['mage', 'mage', 'catapult', 'knight', 'archer']",
    "['knight', 'knight', 'knight', 'catapult', 'mage']",
]


def get_name(level_id):
    """Generate level name based on position within 10-level mini-section."""
    mini_idx = (level_id - 741) // 10
    offset = level_id % 10
    theme_a, theme_b = THEME_PAIRS[mini_idx % len(THEME_PAIRS)]

    if offset == 0:
        return f'{theme_a}{theme_b}'
    if offset % 2 == 1:
        return f'{theme_a}{OFFSET_SUFFIX[offset]}'
    return f'{theme_b}{OFFSET_SUFFIX[offset]}'


def get_description(level_id, name, final_level=1740):
    offset = level_id % 10
    mini_idx = (level_id - 741) // 10

    if level_id == final_level:
        return f'最终决战！击败{name}，统御万道法则，成为凌驾诸天的终极主宰！'

    if level_id == final_level - 1:
        return f'{name}是倒数第二关，敌军火力达到顶峰。'

    if offset == 0:
        next_mini = mini_idx + 1
        if next_mini < 100:
            na, nb = THEME_PAIRS[next_mini % len(THEME_PAIRS)]
            return f'半程关卡！{name}后，将进入{na}{nb}。'
        return f'半程关卡！{name}后，终极决战即将到来。'

    if level_id % 50 == 0 and level_id > 740:
        return f'{name}陨落，更高境界的征途才刚刚开启……'

    return GENERIC_DESCRIPTIONS[(level_id - 741) % len(GENERIC_DESCRIPTIONS)]


def get_stats(level_id):
    """Calculate level stats extrapolating from L740."""
    delta = level_id - 740

    enemy_castle_hp = 360000 + delta * 500

    # player HP: decrease by 1 every 50 levels, floor at 50
    player_castle_hp = max(50, 57 - delta // 50)

    start_gold = 5

    if level_id <= 20:
        gold_rate = 20
    else:
        gold_rate = 20 + ((level_id - 20 - 1) // 15 + 1) * 5

    # enemyGoldRate: +1 every 4 levels on average (25 per 100)
    enemy_gold_rate = 260 + delta // 4

    # spawn interval: decrease by 1 every 12-13 levels, floor at 400
    enemy_spawn_interval = max(400, 515 - delta // 13)

    return {
        'playerCastleHp': player_castle_hp,
        'enemyCastleHp': enemy_castle_hp,
        'startGold': start_gold,
        'goldRate': gold_rate,
        'enemyGoldRate': enemy_gold_rate,
        'enemySpawnInterval': enemy_spawn_interval,
    }


def format_level(level_id, name=None, stats=None, units=None, desc=None):
    name = name or get_name(level_id)
    stats = stats or get_stats(level_id)
    units = units or UNIT_TEMPLATES[(level_id - 741) % len(UNIT_TEMPLATES)]
    desc = desc or get_description(level_id, name)

    return f"""  {{
    id: {level_id},
    name: '{name}',
    playerCastleHp: {stats['playerCastleHp']},
    enemyCastleHp: {stats['enemyCastleHp']},
    startGold: {stats['startGold']},
    goldRate: {stats['goldRate']},
    enemyGoldRate: {stats['enemyGoldRate']},
    enemyUnits: {units},
    enemySpawnInterval: {stats['enemySpawnInterval']},
    description: '{desc}'
  }}"""


def main():
    start_id = 2001
    end_id = 2100
    final_level = end_id
    prev_final_level = start_id - 1

    with open('/Users/crb04/Desktop/城堡大战/js/levels.js', 'r', encoding='utf-8') as f:
        content = f.read()

    # Update previous final level description
    content = re.sub(
        r"description: '最终决战！击败[^']+，统御万道法则，成为凌驾诸天的终极主宰！'",
        f"description: '半程关卡！{get_name(prev_final_level)}后，将进入{get_name(start_id)}。'",
        content,
        count=1
    )

    # Remove closing ]; and add new levels
    content = content.rstrip()
    if content.endswith('];'):
        content = content[:-2].rstrip()
        if not content.endswith(','):
            content += ','

    new_levels = []
    for level_id in range(start_id, end_id + 1):
        name = get_name(level_id)
        stats = get_stats(level_id)
        units = UNIT_TEMPLATES[(level_id - 741) % len(UNIT_TEMPLATES)]
        desc = get_description(level_id, name, final_level=final_level)
        new_levels.append(format_level(level_id, name, stats, units, desc))

    content += '\n' + ',\n'.join(new_levels) + '\n];\n'

    with open('/Users/crb04/Desktop/城堡大战/js/levels.js', 'w', encoding='utf-8') as f:
        f.write(content)

    print(f'Generated levels {start_id}-{end_id} ({len(new_levels)} levels)')
    print(f'L{end_id}: {get_name(end_id)}, enemyHp={get_stats(end_id)["enemyCastleHp"]}')


if __name__ == '__main__':
    main()
