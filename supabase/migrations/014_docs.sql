-- Docs: editable documents with versioning
create table docs (
  id bigint generated always as identity primary key,
  slug text not null unique,
  title text not null,
  content text not null default '',
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create table doc_versions (
  id bigint generated always as identity primary key,
  doc_id bigint not null references docs(id) on delete cascade,
  title text not null,
  content text not null,
  created_at timestamptz default now()
);

create index idx_doc_versions_doc_id on doc_versions(doc_id);

-- Seed the cheat sheet document
insert into docs (slug, title, content) values (
  'cheat-sheet',
  'Cheat Sheet - Witching Hour',
  '# Witching Hour

**Related Docs:** [Witching Hour Cocktail Matrix](#) | [Supplies List](#) | [Witching Hour Spirits/Beers/Wine](#)

## Vendors

| Category | Name | Contact | Notes | Provi | Fintech |
|----------|------|---------|-------|-------|---------|
| General | **Provi** | User: ap@witchinghourbk.com, Pass: 1312Decatur! | | duh | |
| Liquor | **Empire Merchants** | Justin - (646) 771-4903, Customer ID 2117181, COD Tel: (800) 338-3880 | Delivery Mon to Fri | y | y |
| Wine | **Golden Vine** | Marquis - marquis@golden-vines.com, Order from https://app.provi.com, Pay at https://www.canopywines.com/account/ | | n | n |
| Gin, Vodka | **Gary''s Good** | brooklynspirits@gmail.com, Zina - 646-662-5410, (inactive) Sal - +1 929-423-0448 | Delivery Mon to Thu | n | n |
| Beers | **Union Beer** | Tara - 917.295.6852 | Delivery Monday | y | y |
| Brandy | **Skurnik** | Todd Wolfe, twolfe@skurnik.com, 212-731-4465 | Delivery Mon to Fri After 4 pm. Cutoff for Monday delivery 1 pm; every other day 4 pm | y | y |
| Liquor | **Southern Glazer** | https://shop.sgproof.com/, Login: ap@witchinghourbk.com, Pass: w1tchinG#proo, Customer ID 60252, Glenn Teller (516) 730-8380 | $7500 limit COD, net 30. Delivery - Tue | n | y |
| Tequila | **Winebow** | https://winebow.cld.bz/Winebow-NY, Matthew Sarno (646) 263-4136, Manager Jeff Leanheart - 201-988-7337 | | y | y |
| Wines | **T. Edwards** | Josh Friehling, jfriehling@tedwardwines.com, 323-337-6222 | $400 or 4 case min | y | y |
| Beer | **Aces Beer & Soda** | https://goo.gl/maps/AdVMNf4eMrqjRKBn7 | Open to the public and very comparable pricing. Miller High Life ($20.99/case). | n | n |
| Non-Alcohol | **ProofNoMore** | proofnomore.com/wholesale, ed@proofnomore.com | Delivery Thu $300 min | n | n |
| Beer | **Oak Beverages** | Ebi Kagbala, ekagbala@gmail.com | Lone Star, Shiner | n | n |
| Beer | **S.K.I.** | Melody +19176857476 | Dirty Water. Uses PDF for catalogs; Nothing online | y | y |
| Beers | **Ethan** | 347.452.3374, https://www.unionbeerdist.com/unionrp, Login: thai@witchinghourbk.com, Pass: 8de02081 | | | |
| Beer | **PBR** | https://dsdlink.com/Home | | | |

## Food and Garnishes

**Woolco**
https://woolcomobile.com/power-mobile-client/
fabio@woolcofoods.com
646-330-1084
Min Order $300
witchbk / witchbk1

**FreshDirect (w/ Express)**
Min Order $50
Login: thai@witchinghourbk.com
Pass: 1312Decatur

**Baldor Food**
https://www.baldorfood.com
Customer ID - WITCHR
Witching Hour LLC.
Sales Rep - DCLEMENT@BALDORFOOD.COM
Mon to Sat
$200 min

## Legal

**Certificate of Authority**
874290683

**Federal EIN**
874290683

**SLA Serial Number**
1345089

**Unemployment Registration Number**
5596922

**Lawyer - Ben Korngut**
bak@kplawyers.com
Tel: +12125665021

**Expeditor - Zughel Ortiz**
zughel.ortiz@gmail.com

**Landlord - David Moore**
(718) 625-2039
atlasny212@gmail.com
231 Front St
Brooklyn, NY 11201

## DJ''s

- Alex Foxx - https://www.instagram.com/404orest/
- Ionko Joseph - https://www.instagram.com/1osaci/
- Vita - https://www.instagram.com/fashionfoodfrenzy/
- Tyree - https://www.instagram.com/okayguytv/
- Leslie Hanson - https://www.instagram.com/les_go._/
- DJ Cowboy - https://instagram.com/djcowboyno.1
- Michele Yue - https://instagram.com/michele.yue
- Nicole (BootyKween) - https://instagram.com/nicole.a.chu

## Tarot

- Chitra - https://www.instagram.com/ravenstarhealing/
- Sol - https://www.instagram.com/solthedragqueen/
- Teddy - https://www.instagram.com/gretchensanity/

## Appliances

~~**Dishwasher - Ecolab**~~
~~Giovanni Barretta~~
~~Ph: (718) 614-1009~~
~~Email: Giovanni.Barretta@ecolab.com~~
~~Guides: https://lobsterink.com/solution/content/undercounter-training~~
~~ID 507314793~~
~~https://connect.ecolab.com~~
~~$250/mo for machine lease~~
~~$200/mo fee for not buying chemicals~~
~~$380/mo average for buying chemicals on Ecolab (4 chemicals minimum, the cheapest thing is $90)~~

**Dishwasher (current) - AJ Chemical (alternative to Ecolab)**
https://www.ajchemicalsupply.com/contact-aj-chemical-supplies
(631) 805-6919
$275/mo includes rental machine, chemicals, and repair
$275 x 2 for initial deposit

**Chem Chem (alternative to Ecolab)**
718-525-1500

**Commercial Appliance Repair**
https://fixamyc.com/

## Insurance

**Workers Comp - AmTrust**
Policy Number TWC4136109
AQccount Number - 30869431
Broker - World Insurance Associates, LLC

**Disability - Berkshire Hathaway Guard**
Policy Number DB15922928.1
Customer Number 15922928
Broker - Brendan Moser, brendan@mosergrp.com, https://www.mosergrp.com/

~~**Shelterpoint**~~
~~Policy Number D669860~~

**General Liability - Atlantic Casualty Insurance**
**Liquor Liability - Founders Insurance**
Broker - Brendan Moser, brendan@mosergrp.com, https://www.mosergrp.com/

## Repairs and Maintenance

**Security System Installer**
Lock and Tech
Gabriel
(929) 620-4115

Sal (alternative to Lock and Tech)
347-531-3242

**Security System Subscription**
Alarmpath (GSM - secured cellular telecommunications system)
Subscriber Device No. 751189
Digital Account No. 6874

**Richmond Hill Plumbing, Heating, Electric**
Mark
347-251-3000

**Electricians**

Yovi
917-463-7773

Armando
347-260-5566

**Plumbers**

Alex - does emergencies too
347-965-5675

Adam
516-840-0137

Voytek
570-801-6800

Milton
718-532-6433

**Roll Down Security Gate Repairs**

Adolfo
917-662-0110

ABC Gate Repair
917-662-0110

**Ice Machines and Refrigerator**

Ainsworth
929-405-8793

**Awning**

Fivestarawning.com
Five Star Awning
Joe
917-567-4068

## Healthcare

**HealthFirst** - https://www.myhfgroup.org/home
Joseph Xu
917-767-2147
XXu@healthfirst.org

## Keyholders

Ruben Delahuerta
Dominga/Remiggio
Nam
Kino
Lydia
Woolco Delivery Driver
Manhattan Beers Delivery Driver? (Lydia says he didn''t have one)
Love, Live, Laugh Liquor Store
Southern Liquors (Anthony)
Gillian Martinez
Austin Eichler (borrowed from Nam)
Dani and Amare
Kat Bobo

## Screen Printers (Merch Suppliers)

Classy Screens

## Lease

Ends Feb 28, 2033
Year 1: $42,000.00 in equal monthly installments of $3,500.00
Year 2: $42,260.00 in equal monthly installments of $3,605.00
Year 3: $44,557.80 in equal monthly installments of $3,713.15
Year 4: $45,894.53 in equal monthly installments of $3,824.54
Year 5: $47,271.37 in equal monthly installments of $3,939.28
Year 6: $48,689.67 in equal monthly installments of $4,057.46
Year 7: $50,150.20 in equal monthly installments of $4,179.18
Year 8: $51,654.70 in equal monthly installments of $4,304.56
Year 9: $53,204.34 in equal monthly installments of $4,433.70
Year 10: $54,800.47 in equal monthly installments of $4,566.71'
);
