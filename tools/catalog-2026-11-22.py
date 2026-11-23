"""Rebuilds data/parts.json from the Shopee Mall listings picked on 2026-11-22.

Prices are the Shopee Mall listing price for the exact variant (checked on the product page
when a listing had several models). Specs are manufacturer figures; case/GPU sizes are
approximate, so the site tells people to double-check before ordering.
Run:  python3 tools/catalog-2026-11-22.py
"""
import json
from pathlib import Path

L = 'https://s.shopee.ph/'
CHECKED = '2026-11-22'


def p(**kw):
    kw.setdefault('note', '')
    kw['shopeeUrl'] = L + kw.pop('link')
    kw.setdefault('priceChecked', CHECKED)
    return kw


ALL = ['AM4', 'AM5', 'LGA1700']
parts = [
    # ---------------- CPU ----------------
    p(id='cpu-r5-5600', category='cpu', name='AMD Ryzen 5 5600', brand='AMD', price=7945, tier=2, socket='AM4', memTypes=['DDR4'], tdp=65, cores='6C/12T', igpu=0, perf=55, perfMulti=50, boxedCooler=False,
      note='Budget gaming king sa AM4. Kailangan ng GPU. Tray: walang kasamang cooler.', search='Ryzen 5 5600', shopeeItemId='17260830695', link='4qHPSo4FdM'),
    p(id='cpu-r7-5700x', category='cpu', name='AMD Ryzen 7 5700X (Tray + cooler)', brand='AMD', price=10690, tier=3, socket='AM4', memTypes=['DDR4'], tdp=65, cores='8C/16T', igpu=0, perf=64, perfMulti=66, boxedCooler=True,
      note='8 cores sa AM4, may kasamang cooler fan ang listing.', search='Ryzen 7 5700X', shopeeItemId='41812380760', link='2qWKg8hx9s'),
    p(id='cpu-r5-7600', category='cpu', name='AMD Ryzen 5 7600', brand='AMD', price=11999, tier=3, socket='AM5', memTypes=['DDR5'], tdp=65, cores='6C/12T', igpu=5, perf=76, perfMulti=62, boxedCooler=False,
      note='AM5 + DDR5, may upgrade path pa.', search='Ryzen 5 7600', shopeeItemId='23919316418', link='2qWKg8v5EG'),
    p(id='cpu-r7-7700', category='cpu', name='AMD Ryzen 7 7700', brand='AMD', price=12999, tier=4, socket='AM5', memTypes=['DDR5'], tdp=65, cores='8C/16T', igpu=5, perf=86, perfMulti=80, boxedCooler=False,
      note='8 cores sa 65W, swak sa editing at streaming.', search='Ryzen 7 7700', shopeeItemId='23219314719', link='9fMeohnUfT'),
    p(id='cpu-r5-8600g', category='cpu', name='AMD Ryzen 5 8600G (Box)', brand='AMD', price=14999, tier=3, socket='AM5', memTypes=['DDR5'], tdp=65, cores='6C/12T', igpu=24, perf=72, perfMulti=60, boxedCooler=True,
      note='Pinakamalakas na built-in graphics. Valorant at Dota 2 kahit walang GPU.', search='Ryzen 5 8600G', shopeeItemId='25661737644', link='5fqW3LtIpi'),
    p(id='cpu-r7-7800x3d', category='cpu', name='AMD Ryzen 7 7800X3D (Tray)', brand='AMD', price=20475, tier=5, socket='AM5', memTypes=['DDR5'], tdp=120, cores='8C/16T', igpu=5, perf=100, perfMulti=78, boxedCooler=False,
      note='3D V-Cache, top pick para sa CS2 high FPS.', search='Ryzen 7 7800X3D', shopeeItemId='43508944979', link='40iI4IHrij'),
    p(id='cpu-r5-9600x', category='cpu', name='AMD Ryzen 5 9600X (Tray)', brand='AMD', price=12780, tier=3, socket='AM5', memTypes=['DDR5'], tdp=65, cores='6C/12T', igpu=5, perf=84, perfMulti=66, boxedCooler=False, priceChecked='2026-11-23', 
      note='Zen 5, mas mabilis sa gaming kaysa 7600. Tray: walang kasamang cooler.', search='Ryzen 5 9600X', shopeeItemId='25946759050', link='8KrIbuuGak'),
    p(id='cpu-r7-9800x3d', category='cpu', name='AMD Ryzen 7 9800X3D (Tray)', brand='AMD', price=29090, tier=5, socket='AM5', memTypes=['DDR5'], tdp=120, cores='8C/16T', igpu=5, perf=110, perfMulti=90, boxedCooler=False, priceChecked='2026-11-23', 
      note='Pinakamabilis na gaming CPU sa listahan. Kailangan ng dual-tower o AIO.', search='Ryzen 7 9800X3D', shopeeItemId='43465455309', link='8pnZCqUJKA'),
    p(id='cpu-i5-12400', category='cpu', name='Intel Core i5-12400', brand='Intel', price=9699, tier=2, socket='LGA1700', memTypes=['DDR4', 'DDR5'], tdp=65, cores='6C/12T', igpu=6, perf=58, perfMulti=52, boxedCooler=False,
      note='May UHD 730 graphics, swak sa school at office kahit walang GPU.', search='Intel Core i5 12400', shopeeItemId='25666724247', link='3B9B50ncsz'),
    p(id='cpu-i5-14400', category='cpu', name='Intel Core i5-14400 (Tray + fan)', brand='Intel', price=11895, tier=3, socket='LGA1700', memTypes=['DDR4', 'DDR5'], tdp=65, cores='10C/16T', igpu=7, perf=70, perfMulti=68, boxedCooler=True,
      note='10 cores (6P + 4E), may graphics at kasamang fan.', search='Intel Core i5 14400', shopeeItemId='26190194244', link='8AXr2D79qr'),
    p(id='cpu-i7-14700', category='cpu', name='Intel Core i7-14700', brand='Intel', price=26999, tier=5, socket='LGA1700', memTypes=['DDR4', 'DDR5'], tdp=150, cores='20C/28T', igpu=8, perf=98, perfMulti=100, boxedCooler=False,
      note='20 cores para sa mabigat na editing at rendering. Kailangan ng magandang cooler.', search='Intel Core i7 14700', shopeeItemId='43264501342', link='1gKNIGfWl0'),

    # ---------------- Motherboard ----------------
    p(id='mb-prime-a520m-k', category='motherboard', name='ASUS PRIME A520M-K', brand='ASUS', price=3861, tier=1, socket='AM4', chipset='A520', formFactor='mATX', memType='DDR4', memSlots=2, m2Slots=1, wifi=False, vrmMaxTdp=105,
      note='Basic AM4 board, 2 RAM slots.', search='ASUS PRIME A520M-K', shopeeItemId='26390055838', link='8fU7d9iJJp'),
    p(id='mb-b550m-aorus-elite', category='motherboard', name='Gigabyte B550M AORUS ELITE', brand='Gigabyte', price=7799, tier=3, socket='AM4', chipset='B550', formFactor='mATX', memType='DDR4', memSlots=4, m2Slots=2, wifi=False, vrmMaxTdp=170,
      note='4 RAM slots, PCIe 4.0, solid na AM4 board.', search='Gigabyte B550M AORUS ELITE', shopeeItemId='7946731079', link='5fqW3e3UdT'),
    p(id='mb-b550-a-pro', category='motherboard', name='MSI B550-A PRO', brand='MSI', price=8299, tier=3, socket='AM4', chipset='B550', formFactor='ATX', memType='DDR4', memSlots=4, m2Slots=2, wifi=False, vrmMaxTdp=170,
      note='Full ATX, maraming slots.', search='MSI B550-A PRO', shopeeItemId='23418460471', link='5LDff4H5J5'),
    p(id='mb-a620m-h', category='motherboard', name='Gigabyte A620M H', brand='Gigabyte', price=5695, tier=2, socket='AM5', chipset='A620', formFactor='mATX', memType='DDR5', memSlots=2, m2Slots=1, wifi=False, vrmMaxTdp=105,
      note='Pinakamurang daan papuntang AM5.', search='Gigabyte A620M H', shopeeItemId='40570391097', link='4VeYfVG7Cs'),
    p(id='mb-b650m-gaming-wifi', category='motherboard', name='Gigabyte B650M GAMING WIFI', brand='Gigabyte', price=7949, tier=3, socket='AM5', chipset='B650', formFactor='mATX', memType='DDR5', memSlots=2, m2Slots=2, wifi=True, vrmMaxTdp=170,
      note='B650 + WiFi sa murang presyo.', search='Gigabyte B650M GAMING WIFI', shopeeItemId='27523077516', link='LozhrMV0O'),
    p(id='mb-b650m-gaming-plus', category='motherboard', name='MSI B650M GAMING PLUS WIFI', brand='MSI', price=9990, tier=4, socket='AM5', chipset='B650', formFactor='mATX', memType='DDR5', memSlots=4, m2Slots=2, wifi=True, vrmMaxTdp=170,
      note='4 RAM slots + WiFi, swak hanggang 7800X3D.', search='MSI B650M Gaming Plus WIFI', shopeeItemId='28628762264', link='1qdnUbdwnd'),
    p(id='mb-b650-eagle-ax', category='motherboard', name='Gigabyte B650 EAGLE AX', brand='Gigabyte', price=12499, tier=4, socket='AM5', chipset='B650', formFactor='ATX', memType='DDR5', memSlots=4, m2Slots=3, wifi=True, vrmMaxTdp=200,
      note='Full ATX, 3 M.2 slots, WiFi 6E.', search='Gigabyte B650 EAGLE AX', shopeeItemId='24562476072', link='1qdnUdgiLQ'),
    p(id='mb-h610m-e', category='motherboard', name='MSI PRO H610M-E DDR4', brand='MSI', price=4999, tier=1, socket='LGA1700', chipset='H610', formFactor='mATX', memType='DDR4', memSlots=2, m2Slots=1, wifi=False, vrmMaxTdp=95,
      note='Budget Intel board, 2 RAM slots.', search='MSI PRO H610M-E DDR4', shopeeItemId='52208460006', link='LozhtewLf'),
    p(id='mb-b760m-e-d4', category='motherboard', name='MSI PRO B760M-E DDR4', brand='MSI', price=6799, tier=2, socket='LGA1700', chipset='B760', formFactor='mATX', memType='DDR4', memSlots=2, m2Slots=1, wifi=False, vrmMaxTdp=125,
      note='B760 sa DDR4, murang upgrade sa H610.', search='MSI PRO B760M-E DDR4', shopeeItemId='56506619901', link='4qHP4AW3gf'),
    p(id='mb-b760m-ds3h-d4', category='motherboard', name='Gigabyte B760M DS3H DDR4', brand='Gigabyte', price=7999, tier=3, socket='LGA1700', chipset='B760', formFactor='mATX', memType='DDR4', memSlots=4, m2Slots=2, wifi=False, vrmMaxTdp=150,
      note='4 RAM slots DDR4, kaya ang i7.', search='Gigabyte B760M DS3H DDR4', shopeeItemId='9760680259', link='2gCuUCLxaD'),
    p(id='mb-b760m-ds3h-gen5', category='motherboard', name='Gigabyte B760M DS3H GEN5 (DDR5)', brand='Gigabyte', price=8999, tier=3, socket='LGA1700', chipset='B760', formFactor='mATX', memType='DDR5', memSlots=4, m2Slots=2, wifi=False, vrmMaxTdp=150,
      note='DDR5 Intel board.', search='Gigabyte B760M DS3H GEN5 DDR5', shopeeItemId='9757785358', link='7VIAF5BXC8'),

    # Mini-ITX and Intel ATX boards (added 2026-11-22, Shopee Mall, same day's prices)
    p(id='mb-a520i-ac', category='motherboard', name='Gigabyte A520I AC (Mini-ITX)', brand='Gigabyte', price=8099, tier=2, socket='AM4', chipset='A520', formFactor='ITX', memType='DDR4', memSlots=2, m2Slots=1, wifi=True, vrmMaxTdp=105,
      note='Pinakamurang Mini-ITX para sa AM4, may WiFi na.', search='Gigabyte A520I AC', shopeeItemId='6966814186', link='114gt7urah'),
    p(id='mb-b550i-aorus-pro-ax', category='motherboard', name='Gigabyte B550I AORUS PRO AX (Mini-ITX)', brand='Gigabyte', price=13099, tier=4, socket='AM4', chipset='B550', formFactor='ITX', memType='DDR4', memSlots=2, m2Slots=2, wifi=True, vrmMaxTdp=170,
      note='Premium AM4 Mini-ITX, PCIe 4.0 at WiFi 6.', search='Gigabyte B550I AORUS PRO AX', shopeeItemId='7840876004', link='8fU81DesNl'),
    p(id='mb-b650i-ax', category='motherboard', name='Gigabyte B650I AX (Mini-ITX)', brand='Gigabyte', price=11795, tier=4, socket='AM5', chipset='B650', formFactor='ITX', memType='DDR5', memSlots=2, m2Slots=1, wifi=True, vrmMaxTdp=170,
      note='AM5 Mini-ITX na may WiFi 6E, swak sa maliit na build.', search='Gigabyte B650I AX', shopeeItemId='29685482595', link='5LDg364hEL'),
    p(id='mb-b660m-itx-ac', category='motherboard', name='ASRock B660M-ITX/ac (Mini-ITX)', brand='ASRock', price=8995, tier=3, socket='LGA1700', chipset='B660', formFactor='ITX', memType='DDR4', memSlots=2, m2Slots=1, wifi=True, vrmMaxTdp=125,
      note='Intel Mini-ITX sa DDR4, may WiFi.', search='ASRock B660M-ITX/ac', shopeeItemId='23346758428', link='5LDg36Hxq9'),
    p(id='mb-b760-gaming-plus-wifi', category='motherboard', name='MSI B760 GAMING PLUS WIFI DDR4 (ATX)', brand='MSI', price=12999, tier=4, socket='LGA1700', chipset='B760', formFactor='ATX', memType='DDR4', memSlots=4, m2Slots=2, wifi=True, vrmMaxTdp=150,
      note='Full ATX para sa Intel, 4 RAM slots, WiFi 6E.', search='MSI B760 GAMING PLUS WIFI DDR4', shopeeItemId='52306603663', link='60TMqKOV6R'),

    # ---------------- RAM ----------------
    p(id='ram-d4-16-vulcan', category='ram', name='TeamGroup T-Force Vulcan Z DDR4-3200 16GB (2x8GB)', brand='TeamGroup', price=9395, tier=2, memType='DDR4', capacityGB=16, sticks=2, speed=3200,
      note='Dual channel, 2 sticks = mas mabilis.', search='T-Force Vulcan Z DDR4 16GB 2x8GB', shopeeItemId='29280108577', link='1gKNINxsCq'),
    p(id='ram-d4-32-vulcan', category='ram', name='TeamGroup T-Force Vulcan Z DDR4-3200 32GB (2x16GB)', brand='TeamGroup', price=20995, tier=3, memType='DDR4', capacityGB=32, sticks=2, speed=3200,
      note='32GB para sa editing at multitasking.', search='T-Force Vulcan Z DDR4 32GB 2x16GB', shopeeItemId='57051008324', link='4qHP4DUdko'),
    p(id='ram-d4-32-ripjaws', category='ram', name='G.Skill Ripjaws V DDR4-3600 32GB (2x16GB)', brand='G.Skill', price=21295, tier=3, memType='DDR4', capacityGB=32, sticks=2, speed=3600, priceChecked='2026-11-23', 
      note='DDR4-3600 CL18, sweet spot ng AM4.', search='G.Skill Ripjaws V DDR4 3600 32GB', shopeeItemId='45150970666', link='BVasskRam'),
    p(id='ram-d5-16-fury', category='ram', name='Kingston FURY Beast RGB DDR5-5600 16GB (2x8GB)', brand='Kingston', price=20999, tier=2, memType='DDR5', capacityGB=16, sticks=2, speed=5600,
      note='Entry DDR5, dual channel.', search='Kingston Fury Beast RGB DDR5 5600 16GB', shopeeItemId='43023314351', link='7AfJqWLUUo'),
    p(id='ram-d5-16-vulcan', category='ram', name='TeamGroup T-Force Vulcan DDR5-6000 16GB (2x8GB)', brand='TeamGroup', price=21495, tier=2, memType='DDR5', capacityGB=16, sticks=2, speed=6000, priceChecked='2026-11-23', 
      note='DDR5-6000 dual channel, swak sa AM5.', search='T-Force Vulcan DDR5 6000 16GB', shopeeItemId='54421138670', link='8pnZCnZqy3'),
    p(id='ram-d5-32-vulcan', category='ram', name='TeamGroup T-Force Vulcan DDR5-6000 32GB (2x16GB)', brand='TeamGroup', price=35995, tier=4, memType='DDR5', capacityGB=32, sticks=2, speed=6000,
      note='6000 MT/s, sweet spot ng AM5.', search='T-Force Vulcan DDR5 6000 32GB', shopeeItemId='55250219954', link='7AfJqWTG8B'),
    p(id='ram-d5-32-trident', category='ram', name='G.Skill Trident Z5 Neo RGB DDR5-6000 32GB (2x16GB)', brand='G.Skill', price=40999, tier=4, memType='DDR5', capacityGB=32, sticks=2, speed=6000, priceChecked='2026-11-23', 
      note='AMD EXPO, RGB. Plug and play sa AM5.', search='G.Skill Trident Z5 Neo DDR5 6000 32GB', shopeeItemId='21771571383', link='AKcMzXqgQm'),
    p(id='ram-d5-64-delta', category='ram', name='TeamGroup T-Force Delta RGB DDR5-6000 64GB (2x32GB)', brand='TeamGroup', price=75995, tier=5, memType='DDR5', capacityGB=64, sticks=2, speed=6000,
      note='64GB para sa 4K editing at heavy projects.', search='T-Force Delta DDR5 6000 64GB', shopeeItemId='27616821046', link='1qdnUixFvT'),

    # ---------------- GPU ----------------
    p(id='gpu-rtx3050', category='gpu', name='MSI GeForce RTX 3050 Ventus 2X E 6GB OC', brand='MSI', price=17495, tier=1, vramGB=6, tdp=70, lengthMm=190, recPsuW=300, perf=34,
      note='Mababa ang konsumo, pang-esports sa 1080p.', search='MSI RTX 3050 Ventus 2X E 6GB', shopeeItemId='28977226825', link='3Vm1Tne42L'),
    p(id='gpu-rtx5050', category='gpu', name='MSI GeForce RTX 5050 Ventus 2X OC 8GB', brand='MSI', price=25399, tier=2, vramGB=8, tdp=130, lengthMm=200, recPsuW=550, perf=58,
      note='Bagong 50-series entry, may DLSS 4.', search='MSI RTX 5050 Ventus 2X OC 8GB', shopeeItemId='42212709516', link='9fMep9abM8'),
    p(id='gpu-rx7600', category='gpu', name='ASUS Dual Radeon RX 7600 EVO OC 8GB', brand='ASUS', price=25999, tier=2, vramGB=8, tdp=165, lengthMm=243, recPsuW=550, perf=58,
      note='Solid 1080p high settings.', search='ASUS Dual RX 7600 EVO OC 8GB', shopeeItemId='23188684715', link='40iITHJf0W'),
    p(id='gpu-rtx5060', category='gpu', name='MSI GeForce RTX 5060 Shadow 2X OC 8GB', brand='MSI', price=33995, tier=3, vramGB=8, tdp=145, lengthMm=197, recPsuW=550, perf=70,
      note='1080p high refresh, matipid sa kuryente.', search='MSI RTX 5060 Shadow 2X OC 8GB', shopeeItemId='43558221119', link='30pksuuyHh'),
    p(id='gpu-rtx5060ti-8', category='gpu', name='MSI GeForce RTX 5060 Ti Shadow 2X OC Plus 8GB', brand='MSI', price=33195, tier=3, vramGB=8, tdp=180, lengthMm=199, recPsuW=600, perf=78, priceChecked='2026-11-23', 
      note='Mas malakas sa RTX 5060 sa halos parehong presyo.', search='MSI RTX 5060 Ti Shadow 2X 8GB', shopeeItemId='27840614312', link='1CAgUn1ta'),
    p(id='gpu-rx9060xt-16', category='gpu', name='Sapphire Pulse Radeon RX 9060 XT 16GB', brand='Sapphire', price=37995, tier=3, vramGB=16, tdp=182, lengthMm=240, recPsuW=550, perf=78,
      note='16GB VRAM, matagal bago maluma.', search='Sapphire Pulse RX 9060 XT 16GB', shopeeItemId='43904108395', link='3g5Rg91e4T'),
    p(id='gpu-rtx5060ti-16', category='gpu', name='MSI GeForce RTX 5060 Ti Shadow 2X OC Plus 16GB', brand='MSI', price=62299, tier=4, vramGB=16, tdp=180, lengthMm=199, recPsuW=600, perf=82,
      note='16GB + NVENC, sulit sa editing at gaming.', search='MSI RTX 5060 Ti Shadow 2X 16GB', shopeeItemId='47807285377', link='gRq6dLS9P'),
    p(id='gpu-rx9070xt', category='gpu', name='Gigabyte Radeon RX 9070 XT Gaming OC 16GB', brand='Gigabyte', price=63995, tier=5, vramGB=16, tdp=304, lengthMm=288, recPsuW=750, perf=112,
      note='1440p high refresh, pinakamalakas sa listahan.', search='Gigabyte RX 9070 XT Gaming OC 16GB', shopeeItemId='29181942707', link='2VtUI1F6It'),
    p(id='gpu-rx9070xt-ch', category='gpu', name='ASRock Radeon RX 9070 XT Challenger 16GB', brand='ASRock', price=56290, tier=5, vramGB=16, tdp=304, lengthMm=314, recPsuW=750, perf=112, priceChecked='2026-11-23', 
      note='Pinakamurang RX 9070 XT sa listahan. Mahaba, i-check ang case.', search='ASRock RX 9070 XT Challenger 16GB', shopeeItemId='54663012096', link='6q2Up4WIxM'),
    p(id='gpu-rtx5070', category='gpu', name='MSI GeForce RTX 5070 Shadow 2X OC 12GB', brand='MSI', price=65999, tier=5, vramGB=12, tdp=250, lengthMm=242, recPsuW=650, perf=100,
      note='1440p high refresh, CS2 sa 240Hz territory.', search='MSI RTX 5070 Shadow 2X OC 12GB', shopeeItemId='29635878408', link='6L6Cr3mU2A'),
    p(id='gpu-rtx5070ti', category='gpu', name='MSI GeForce RTX 5070 Ti Shadow 3X OC 16GB', brand='MSI', price=101999, tier=5, vramGB=16, tdp=300, lengthMm=303, recPsuW=750, perf=120, priceChecked='2026-11-23', 
      note='1440p at 4K, 16GB para sa editing at high settings.', search='MSI RTX 5070 Ti Shadow 3X OC 16GB', shopeeItemId='26985928616', link='7pv20wS29B'),

    # ---------------- SSD ----------------
    p(id='ssd-nv3-500', category='ssd', name='Kingston NV3 500GB NVMe', brand='Kingston', price=7295, tier=2, interface='NVMe', capacityGB=500,
      note='Murang NVMe para sa boot drive.', search='Kingston NV3 500GB', shopeeItemId='24439160317', link='W8PuMdqBW'),
    p(id='ssd-a400-480', category='ssd', name='Kingston A400 480GB SATA', brand='Kingston', price=9049, tier=1, interface='SATA', capacityGB=480,
      note='SATA, para sa lumang board na walang M.2.', search='Kingston A400 480GB', shopeeItemId='856156876', link='9AQODPOjXq'),
    p(id='ssd-s880-1tb', category='ssd', name='Fanxiang S880 1TB NVMe Gen4', brand='Fanxiang', price=10999, tier=3, interface='NVMe', capacityGB=1000,
      note='Mabilis na Gen4, sulit sa 1TB.', search='Fanxiang S880 1TB', shopeeItemId='27366612455', link='2BGdtSMzkU'),
    p(id='ssd-nv3-1tb', category='ssd', name='Kingston NV3 1TB NVMe', brand='Kingston', price=11395, tier=3, interface='NVMe', capacityGB=1000,
      note='1TB, kasya ang ilang games at projects.', search='Kingston NV3 1TB', shopeeItemId='24439160317', link='2BGdtRBENF'),
    p(id='ssd-990evo-1tb', category='ssd', name='Samsung 990 EVO Plus 1TB NVMe', brand='Samsung', price=18999, tier=4, interface='NVMe', capacityGB=1000,
      note='Mabilis at maaasahan.', search='Samsung 990 EVO Plus 1TB', shopeeItemId='25839702326', link='906y20oJrR'),
    p(id='ssd-sn5000-2tb', category='ssd', name='WD Blue SN5000 2TB NVMe', brand='WD', price=28999, tier=5, interface='NVMe', capacityGB=2000,
      note='2TB para sa video files at maraming games.', search='WD Blue SN5000 2TB', shopeeItemId='27582245541', link='40iI4pQX94'),

    # ---------------- PSU ----------------
    p(id='psu-pro650b', category='psu', name='ASRock PRO-650B 650W Bronze', brand='ASRock', price=2995, tier=2, watts=650, rating='80+ Bronze', formFactor='ATX',
      note='ATX 3.1, sapat sa mid-range GPU.', search='ASRock Pro-650B', shopeeItemId='52852674258', link='20xDhB6OJl'),
    p(id='psu-a550bn', category='psu', name='MSI MAG A550BN 550W Bronze', brand='MSI', price=3125, tier=1, watts=550, rating='80+ Bronze', formFactor='ATX',
      note='Swak sa entry builds.', search='MSI MAG A550BN', shopeeItemId='24493847370', link='8VAhR7Yi2Q'),
    p(id='psu-a750gl', category='psu', name='MSI MAG A750GL 750W Gold', brand='MSI', price=6150, tier=4, watts=750, rating='80+ Gold', formFactor='ATX',
      note='Gold, fully modular, PCIe 5.1 ready.', search='MSI MAG A750GL', shopeeItemId='28476550522', link='AUvlooHCkM'),
    p(id='psu-a850gl', category='psu', name='MSI MAG A850GL 850W Gold', brand='MSI', price=8095, tier=5, watts=850, rating='80+ Gold', formFactor='ATX',
      note='Para sa high-end GPU at future upgrades.', search='MSI MAG A850GL', shopeeItemId='23984383831', link='AKcLcVQE4p'),
    p(id='psu-a1000gl', category='psu', name='MSI MAG A1000GL 1000W Gold', brand='MSI', price=10695, tier=5, watts=1000, rating='80+ Gold', formFactor='ATX', priceChecked='2026-11-23', 
      note='1000W, ATX 3.1. May headroom para sa RTX 5070 Ti at upgrades.', search='MSI MAG A1000GL', shopeeItemId='28961547220', link='3LScekTbOh'),

    # ---------------- Case ----------------
    p(id='case-db330m', category='case', name='darkFlash DB330M Mesh (mATX)', brand='darkFlash', price=1695, tier=1, formFactors=['mATX', 'ITX'], maxGpuMm=300, maxCoolerMm=155, rad240=False, psuFormFactors=['ATX'],
      note='Mura, mesh front at glass side.', search='darkFlash DB330M Mesh', shopeeItemId='56053313486', link='1LhWu0TVf1'),
    p(id='case-infinity-m', category='case', name='Tecware Infinity M (mATX)', brand='Tecware', price=3062, tier=2, formFactors=['mATX', 'ITX'], maxGpuMm=320, maxCoolerMm=160, rad240=True, psuFormFactors=['ATX'],
      note='May kasamang 3 aRGB fans.', search='Tecware Infinity M', shopeeItemId='25264081451', link='4qHP4ROz9T'),
    p(id='case-air1000-lite', category='case', name='Montech AIR 1000 Lite (ATX)', brand='Montech', price=3599, tier=2, formFactors=['ATX', 'mATX', 'ITX'], maxGpuMm=330, maxCoolerMm=161, rad240=True, psuFormFactors=['ATX'],
      note='Murang ATX case na maganda ang airflow.', search='Montech AIR 1000 Lite', shopeeItemId='28363309503', link='3g5RgIbGOD'),
    p(id='case-lianli-a3', category='case', name='Lian Li A3-mATX', brand='Lian Li', price=4499, tier=3, formFactors=['mATX', 'ITX'], maxGpuMm=415, maxCoolerMm=165, rad240=True, psuFormFactors=['ATX'],
      note='Compact pero kasya ang malalaking GPU.', search='Lian Li A3-mATX', shopeeItemId='24333733607', link='7fbaRea81d'),
    p(id='case-h7-flow', category='case', name='NZXT H7 Flow (ATX)', brand='NZXT', price=7399, tier=4, formFactors=['ATX', 'mATX', 'ITX'], maxGpuMm=400, maxCoolerMm=185, rad240=True, psuFormFactors=['ATX'],
      note='Premium airflow, maluwag gawan ng build.', search='NZXT H7 Flow', shopeeItemId='26611653658', link='1W0x6K7EFc'),
    p(id='case-dlx21-white', category='case', name='darkFlash DLX21 Mesh White (ATX)', brand='darkFlash', price=4750, tier=3, formFactors=['ATX', 'mATX', 'ITX'], maxGpuMm=400, maxCoolerMm=170, rad240=True, psuFormFactors=['ATX'], priceChecked='2026-11-23', 
      note='Puting ATX case, mesh front at hinged glass.', search='darkFlash DLX21 Mesh White', shopeeItemId='4857963073', link='3qOtFgaRE8'),

    # ---------------- Cooler ----------------
    p(id='cooler-ak400-se', category='cooler', name='DeepCool AK400 Digital SE', brand='DeepCool', price=1785, tier=2, type='air', sockets=ALL, heightMm=155, tdpRating=220,
      note='Single tower na may temp display.', search='DeepCool AK400 Digital SE', shopeeItemId='54800782453', link='2BGdtaflIQ'),
    p(id='cooler-pa120-mini', category='cooler', name='Thermalright Peerless Assassin 120 Mini', brand='Thermalright', price=2399, tier=3, type='air', sockets=ALL, heightMm=135, tdpRating=220,
      note='Dual tower pero 135mm lang, kasya sa maliit na case.', search='Thermalright PA120 Mini', shopeeItemId='26601051704', link='60TMSc2H40'),
    p(id='cooler-pa120se', category='cooler', name='Thermalright Peerless Assassin 120 SE', brand='Thermalright', price=2650, tier=4, type='air', sockets=ALL, heightMm=155, tdpRating=245,
      note='Dual tower, kaya ang i7 at 7800X3D.', search='Thermalright Peerless Assassin 120 SE', shopeeItemId='42061788217', link='7AfJqkopLL'),
    p(id='cooler-mag-a13-240', category='cooler', name='MSI MAG CoreLiquid A13 240 (AIO)', brand='MSI', price=4095, tier=5, type='aio', sockets=ALL, heightMm=0, tdpRating=260,
      note='240mm liquid cooler, kailangan ng case na may 240mm radiator mount.', search='MSI MAG CoreLiquid A13 240', shopeeItemId='26678389320', link='2VtUIBOBwg'),
]

# Shopee product images (from the affiliate portal's Product Offer pages), served by Shopee's CDN.
THUMBS = dict(line.split() for line in (Path(__file__).resolve().parent.parent / 'data' / 'thumbs.txt').read_text().splitlines() if line.strip())
for part in parts:
    img = THUMBS.get(part.get('shopeeItemId', ''))
    if img:
        part['image'] = f'https://down-ph.img.susercontent.com/file/{img}@resize_w320_nl.webp'

stock = dict(id='cooler-stock', category='cooler', name='Stock cooler (kasama sa CPU)', brand='', price=0, tier=0, stock=True, type='air', sockets=ALL, heightMm=70, tdpRating=95,
             note='Libre kung may kasamang cooler ang CPU.', search='', shopeeUrl='')
parts.append(stock)

out = {
    'meta': {
        'currency': 'PHP',
        'priceChecked': CHECKED,
        'priceNote': 'Presyo ng Shopee Mall listing noong ' + CHECKED + '. Nagbabago ang presyo; i-check sa Shopee bago bumili.',
        'linkSubId': 'pcbuilder',
    },
    'parts': parts,
}
path = Path(__file__).resolve().parent.parent / 'data' / 'parts.json'
path.write_text(json.dumps(out, indent=2, ensure_ascii=False) + '\n')
ids = [x['id'] for x in parts]
assert len(ids) == len(set(ids)), 'duplicate ids'
print(f'Wrote {len(parts)} parts ({sum(1 for x in parts if x["shopeeUrl"])} with links)')
