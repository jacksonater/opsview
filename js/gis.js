// gis.js — GIS crossover, terminus, siding data + layer management

// ── DATA (global scope — needed by app.js disruption creation) ──
// YJM GIS Register crossover data — 36 mainline crossovers (MGA55 → WGS84)
var GIS_XO=[
  // ── Route 1 ──
  {n:'Elgin Street',pole:'EGS139-DPO',rt:'1',la:-37.796916,lo:144.965347},
  {n:'Lygon Street',pole:'LGB070-DPO',rt:'1',la:-37.777727,lo:144.970787},
  {n:'Park Street South Melbourne',pole:'PSM068-DPO',rt:'1',la:-37.835444,lo:144.960831},
  {n:'Southbank Boulevard',pole:'SBB006-DPO',rt:'1',la:-37.823581,lo:144.969208},
  {n:'Sturt Street',pole:'SSM026-DPO',rt:'1',la:-37.827332,lo:144.966206},
  // ── Route 3 ──
  {n:'Balaclava Road',pole:'BRC154-DPO',rt:'3',la:-37.873647,lo:145.032694},
  // ── Route 5 ──
  {n:'Wattletree Road',pole:'WTL039-DPO',rt:'5',la:-37.862516,lo:145.029416},
  // ── Route 6 ──
  {n:'Cameron Street',pole:'CST005-DPO',rt:'6',la:-37.756197,lo:144.961975},
  {n:'High Street Prahran',pole:'HSP003-DPO',rt:'6',la:-37.850333,lo:144.981557},
  {n:'High Street Prahran',pole:'HSP124-DPO',rt:'6',la:-37.856502,lo:145.028399},
  {n:'High Street Prahran',pole:'HSP156-DPO',rt:'6',la:-37.85811,lo:145.040719},
  {n:'Moreland Road',pole:'MLD003-DPO',rt:'6',la:-37.75656,lo:144.973897},
  // ── Route 11 ──
  {n:'Brunswick Street',pole:'BWS002-DPO',rt:'11',la:-37.807563,lo:144.976908},
  {n:'Miller Street (East)',pole:'MLE007-UPO',rt:'11',la:-37.751789,lo:144.996564},
  {n:'Miller Street (East)',pole:'MLE008-DPO',rt:'11',la:-37.751773,lo:144.996738},
  {n:'Miller Street (East)',pole:'MLE020-DPO',rt:'11',la:-37.752212,lo:145.000876},
  {n:'St Georges Road',pole:'SGN132A-UPO',rt:'11',la:-37.774485,lo:144.990076},
  {n:'St Georges Road',pole:'SGN216-DPO',rt:'11',la:-37.752439,lo:144.994841},
  // ── Route 12 ──
  {n:'Albert Road',pole:'ARS082-DPO',rt:'12',la:-37.839545,lo:144.962924},
  // ── Route 16 ──
  {n:'Carlisle Street',pole:'CSK012-UPO',rt:'16',la:-37.866938,lo:144.97898},
  {n:'Dandenong Road Prahran',pole:'DRP094-DPO',rt:'16',la:-37.865956,lo:145.026863},
  {n:'Glenferrie Road',pole:'GFH109ADPO',rt:'16',la:-37.836339,lo:145.032872},
  {n:'Glenferrie Road',pole:'GFH149-DPO-001',rt:'16',la:-37.824268,lo:145.035054},
  {n:'St Kilda Road',pole:'STK041A-DPO',rt:'16',la:-37.831245,lo:144.97141},
  {n:'St Kilda Road',pole:'STK052B-UPO',rt:'16',la:-37.833907,lo:144.973728},
  {n:'Swanston Street',pole:'SWC188ADPO',rt:'16',la:-37.810589,lo:144.964287},
  // ── Route 19 ──
  {n:'Sydney Road Brunswick',pole:'SRB165-DPO',rt:'19',la:-37.777605,lo:144.960336},
  {n:'Sydney Road Brunswick',pole:'SRB236-DPO-001',rt:'19',la:-37.757556,lo:144.963762},
  {n:'Sydney Road Coburg',pole:'SRC076-DPO',rt:'19',la:-37.740637,lo:144.966725},
  // ── Route 30 ──
  {n:'Footscray Road Docklands',pole:'FSR004-MPO',rt:'30',la:-37.81213,lo:144.941948},
  {n:'Victoria Parade East Melbourne',pole:'VPE074-DPO',rt:'30',la:-37.808113,lo:144.974993},
  // ── Route 35 ──
  {n:'LaTrobe Street',pole:'LSC003AUPO',rt:'35',la:-37.812938,lo:144.952258},
  {n:'LaTrobe Street',pole:'LSC029A-DPO',rt:'35',la:-37.810619,lo:144.96034},
  {n:'LaTrobe Street',pole:'LSC045A-DPO',rt:'35',la:-37.809235,lo:144.965074},
  // ── Route 48 ──
  {n:'Bridge Road',pole:'BRR161-DPO-001',rt:'48',la:-37.819893,lo:145.01205},
  {n:'Collins Street Docklands',pole:'CSD003-DPO',rt:'48',la:-37.820426,lo:144.94944},
  {n:'High Street Kew',pole:'HSK111-DPO',rt:'48',la:-37.799666,lo:145.049893},
  // ── Route 57 ──
  {n:'Abbotsford Street',pole:'ABS090-DPO-001',rt:'57',la:-37.794241,lo:144.947031},
  {n:'Maribyrnong Road',pole:'MRA135-DPO-001',rt:'57',la:-37.770634,lo:144.906194},
  {n:'Raleigh Road',pole:'RRD199ADPO',rt:'57',la:-37.769297,lo:144.883771},
  {n:'Union Road',pole:'URD087A-DPO',rt:'57',la:-37.778512,lo:144.915065},
  {n:'Victoria Street North Melbourne',pole:'VSN012-DPO',rt:'57',la:-37.806193,lo:144.95871},
  // ── Route 58 ──
  {n:'Domain Road',pole:'DSY005-DPO-001',rt:'58',la:-37.83313,lo:144.974735},
  {n:'Kingsway',pole:'KWY005-DPO',rt:'58',la:-37.826946,lo:144.961381},
  {n:'Market Street',pole:'MST069-DPO',rt:'58',la:-37.818807,lo:144.960874},
  {n:'Melville Road',pole:'MLR183A-DPO',rt:'58',la:-37.751646,lo:144.946054},
  {n:'Park Street South Melbourne (Rte 58)',pole:'PKS019-UPO-001',rt:'58',la:-37.832737,lo:144.970213},
  {n:'Peel Street',pole:'PST005-DPO',rt:'58',la:-37.802452,lo:144.956595},
  {n:'Royal Park',pole:'RPK002-DPO-001',rt:'58',la:-37.792966,lo:144.948081},
  {n:'Royal Park',pole:'RPK058-DPO',rt:'58',la:-37.780989,lo:144.950144},
  {n:'Toorak Road South Yarra',pole:'TRT128A-DPO',rt:'58',la:-37.841832,lo:145.015155},
  {n:'Toorak Road West',pole:'TRW016-DPO',rt:'58',la:-37.837533,lo:144.980155},
  {n:'William Street',pole:'WSC026-DPO',rt:'58',la:-37.808999,lo:144.955169},
  // ── Route 59 ──
  {n:'Elizabeth Street',pole:'EZT026-DPO',rt:'59',la:-37.8119,lo:144.962094},
  {n:'Elizabeth Street',pole:'EZT053-DPO',rt:'59',la:-37.805586,lo:144.959189},
  {n:'Flemington Road',pole:'FRD028-DPO',rt:'59',la:-37.795122,lo:144.949357},
  {n:'Flemington Road',pole:'FRD051-DPO',rt:'59',la:-37.789872,lo:144.942768},
  {n:'Mathews Avenue',pole:'MAV311-DPO',rt:'59',la:-37.735447,lo:144.889268},
  {n:'Mathews Avenue',pole:'MAV356ADPO',rt:'59',la:-37.722571,lo:144.891412},
  {n:'Mt Alexander Road Essendon',pole:'MAE206-DPO',rt:'59',la:-37.754877,lo:144.917474},
  {n:'Mt Alexander Road Essendon',pole:'MAE241-DPO',rt:'59',la:-37.745185,lo:144.910685},
  {n:'Victoria Street Melbourne',pole:'VSM009A-DPO',rt:'59',la:-37.806387,lo:144.960441},
  // ── Route 64 ──
  {n:'Dandenong Road Prahran',pole:'DRP005-DPO',rt:'64',la:-37.857923,lo:144.993404},
  {n:'Dandenong Road Prahran',pole:'DRP050-DPO',rt:'64',la:-37.860305,lo:145.011148},
  {n:'Hawthorn Road',pole:'HRC064ADPO',rt:'64',la:-37.885502,lo:145.022249},
  {n:'Hawthorn Road',pole:'HRC120-DPO',rt:'64',la:-37.900786,lo:145.019326},
  // ── Route 67 ──
  {n:'Brighton Road',pole:'BRS017-DPO',rt:'67',la:-37.872478,lo:144.98989},
  {n:'Brighton Road',pole:'BRS055-DPO-001',rt:'67',la:-37.882475,lo:144.996143},
  {n:'Glenhuntly Road',pole:'GHR130-UPO-001',rt:'67',la:-37.887439,lo:145.026215},
  {n:'Glenhuntly Road',pole:'GHR169-DPO',rt:'67',la:-37.889309,lo:145.041267},
  {n:'St Kilda Road',pole:'STK134-DPO',rt:'67',la:-37.854627,lo:144.982254},
  {n:'Swanston Street',pole:'SWC166-DPO',rt:'67',la:-37.803705,lo:144.963419},
  {n:'Swanston Street',pole:'SWC181-DPO',rt:'67',la:-37.808987,lo:144.963548},
  // ── Route 70 ──
  {n:'Flinders Street Docklands',pole:'FSD002-DPO',rt:'70',la:-37.821372,lo:144.954129},
  {n:'Flinders Street Docklands',pole:'FSD006-DPO',rt:'70',la:-37.821696,lo:144.953014},
  {n:'Harbour Esplanade',pole:'HBE009-MPO',rt:'70',la:-37.817185,lo:144.945907},
  {n:'Melbourne Park',pole:'MEP014-DPO',rt:'70',la:-37.819775,lo:144.979379},
  {n:'Riversdale Road',pole:'RVR086-DPO',rt:'70',la:-37.831755,lo:145.060159},
  {n:'Riversdale Road',pole:'RVR143-DPO',rt:'70',la:-37.834279,lo:145.083077},
  {n:'Swan Street',pole:'SWS055-DPO',rt:'70',la:-37.824501,lo:144.987889},
  {n:'Wallen Road',pole:'WAR145-DPO',rt:'70',la:-37.827049,lo:145.024561},
  // ── Route 72 ──
  {n:'Burke Road',pole:'BRK009-DPO',rt:'72',la:-37.851544,lo:145.052688},
  {n:'Burke Road',pole:'BRK053-DPO-001',rt:'72',la:-37.837728,lo:145.055502},
  {n:'Burke Road',pole:'BRK071-DPO',rt:'72',la:-37.831883,lo:145.056602},
  {n:'Burke Road',pole:'BRK076-DPO',rt:'72',la:-37.830862,lo:145.056796},
  {n:'Burke Road',pole:'BRK092-DPO',rt:'72',la:-37.826002,lo:145.057721},
  {n:'Commercial Road',pole:'CMR002-DPO-001',rt:'72',la:-37.844967,lo:144.979586},
  {n:'Malvern Road',pole:'MLV133-DPO',rt:'72',la:-37.851547,lo:145.02936},
  // ── Route 75 ──
  {n:'Burwood Highway',pole:'BHE120-DPO',rt:'75',la:-37.852106,lo:145.133353},
  {n:'Burwood Highway',pole:'BHE182-DPO',rt:'75',la:-37.852744,lo:145.152985},
  {n:'Burwood Road',pole:'BRH043-DPO',rt:'75',la:-37.820326,lo:145.017143},
  {n:'Camberwell Road',pole:'CRC062-DPO',rt:'75',la:-37.846139,lo:145.073558},
  {n:'Flinders Street City',pole:'FSC011-DPO',rt:'75',la:-37.820034,lo:144.958567},
  {n:'Flinders Street City',pole:'FSC027-DPO',rt:'75',la:-37.818522,lo:144.963821},
  {n:'Flinders Street City',pole:'FSC046-DPO',rt:'75',la:-37.816523,lo:144.970628},
  {n:'Wellington Parade',pole:'WPE090-DPO',rt:'75',la:-37.816504,lo:144.986304},
  // ── Route 78 ──
  {n:'Chapel Street Prahran',pole:'CSP098-DPO',rt:'78',la:-37.839005,lo:144.995725},
  {n:'Chapel Street Prahran',pole:'CSP164-DPO',rt:'78',la:-37.858283,lo:144.992164},
  {n:'Chapel Street Prahran',pole:'CSP209-DPO',rt:'78',la:-37.87123,lo:144.989831},
  {n:'Church Street Richmond',pole:'CSR054-DPO',rt:'78',la:-37.82631,lo:144.997829},
  // ── Route 82 ──
  {n:'Ascot Vale Road',pole:'AVR016-DPO-001',rt:'82',la:-37.768028,lo:144.924705},
  {n:'Hampstead Road',pole:'HMS011-MPO',rt:'82',la:-37.775588,lo:144.88011},
  {n:'River Street',pole:'RST045-DPO',rt:'82',la:-37.779842,lo:144.890135},
  // ── Route 86 ──
  {n:'Bourke Street City',pole:'BSC006-DPO',rt:'86',la:-37.816591,lo:144.955006},
  {n:'Bourke Street City',pole:'BSC021-DPO',rt:'86',la:-37.815274,lo:144.959617},
  {n:'Bourke Street City',pole:'BSC053-DPO',rt:'86',la:-37.81242,lo:144.969429},
  {n:'LaTrobe Street Docklands',pole:'LSD003-DPO',rt:'86',la:-37.814792,lo:144.945799},
  {n:'Nicholson Street Fitzroy',pole:'NSF073-DPO',rt:'86',la:-37.810056,lo:144.972846},
  {n:'Plenty Road',pole:'PRB027-DPO',rt:'86',la:-37.751245,lo:145.002411},
  {n:'Plenty Road',pole:'PRB140-DPO',rt:'86',la:-37.725249,lo:145.023735},
  {n:'Plenty Road',pole:'PRB213-DPO',rt:'86',la:-37.716246,lo:145.043442},
  {n:'Plenty Road',pole:'PRB316-DPO',rt:'86',la:-37.695238,lo:145.059923},
  {n:'Queens Parade',pole:'QPD117A-UPO',rt:'86',la:-37.785993,lo:144.994232},
  {n:'Spencer Street',pole:'SNC023-DPO',rt:'86',la:-37.814611,lo:144.95211},
  // ── Route 96 ──
  {n:'Esplanade',pole:'ESP058-DPO',rt:'96',la:-37.866805,lo:144.976442},
  {n:'Esplanade',pole:'ESP063-DPO',rt:'96',la:-37.867116,lo:144.977737},
  {n:'Nicholson Street Fitzroy',pole:'NSF084-DPO',rt:'96',la:-37.806712,lo:144.973404},
  {n:'Nicholson Street Fitzroy',pole:'NSF176-DPO',rt:'96',la:-37.780983,lo:144.97797},
  {n:'St Kilda Station',pole:'SKS003-DPO',rt:'96',la:-37.858838,lo:144.977126},
  // ── Route 109 ──
  {n:'Barkers Road',pole:'BKR020-DPO',rt:'109',la:-37.812841,lo:145.021143},
  {n:'Collins Street City',pole:'CSC004-DPO',rt:'109',la:-37.818654,lo:144.955585},
  {n:'Collins Street City',pole:'CSC025-DPO',rt:'109',la:-37.816506,lo:144.962982},
  {n:'Collins Street City',pole:'CSC044-DPO',rt:'109',la:-37.81456,lo:144.969682},
  {n:'High Street Kew',pole:'HSK033-DPO',rt:'109',la:-37.812243,lo:145.024359},
  {n:'High Street Kew',pole:'HSK055-DPO',rt:'109',la:-37.807149,lo:145.029833},
  {n:'Port Melbourne Light Rail',pole:'PMR075-DPO',rt:'109',la:-37.830857,lo:144.947561},
  {n:'Spencer Street Bridge',pole:'SSB003-DPO',rt:'109',la:-37.821958,lo:144.95549},
  {n:'Victoria Parade East Melbourne',pole:'VPE115ADPO',rt:'109',la:-37.809736,lo:144.990231},
  {n:'Victoria Street Richmond',pole:'VSR179-UPO-001',rt:'109',la:-37.811718,lo:145.012452},
  {n:'Whitehorse Road',pole:'WHR015-DPO',rt:'109',la:-37.811067,lo:145.066578},
  {n:'Whitehorse Road',pole:'WHR093-DPO',rt:'109',la:-37.814763,lo:145.097341},
  {n:'Whiteman Street',pole:'WHS006A-DPO',rt:'109',la:-37.826269,lo:144.955949}
];

// Crossover → Route proximity mapping (auto-computed from GTFS geometry, <120m threshold)
var XO_ROUTES={
  'LGB070-DPO':["1", "6"],
  'PSM068-DPO':["1", "12"],
  'SBB006-DPO':["1", "3", "5", "6", "16", "64", "67", "72"],
  'SSM026-DPO':["1"],
  'BRC154-DPO':["3"],
  'WTL039-DPO':["5", "16"],
  'CST005-DPO':["6"],
  'HSP003-DPO':["6", "3", "5", "64", "67", "16"],
  'HSP124-DPO':["6"],
  'HSP156-DPO':["6"],
  'MLD003-DPO':["6", "1"],
  'BWS002-DPO':["11", "12", "109", "30"],
  'MLE007-UPO':["11"],
  'MLE008-DPO':["11"],
  'MLE020-DPO':["86"],
  'SGN132A-UPO':["11"],
  'SGN216-DPO':["11"],
  'ARS082-DPO':["12"],
  'CSK012-UPO':["16", "96"],
  'DRP094-DPO':["16", "64"],
  'STK041A-DPO':["3", "5", "6", "64", "16", "67", "72"],
  'STK052B-UPO':["6", "67", "72", "5", "64", "58", "3", "16"],
  'SWC188ADPO':["1", "3", "5", "6", "64", "67", "72", "16", "30", "35"],
  'SWC211-DPO':["78"],
  'SRB165-DPO':["19"],
  'SRB236-DPO-001':["19"],
  'SRC076-DPO':["19"],
  'VPE074-DPO':["30", "12", "109", "11"],
  'LSC003AUPO':["35", "30", "86"],
  'LSC029A-DPO':["30", "35"],
  'LSC045A-DPO':["30", "35"],
  'BRR161-DPO-001':["48", "75"],
  'CSD003-DPO':["11", "48"],
  'HSK111-DPO':["48"],
  'ABS090-DPO-001':["57", "59", "58"],
  'MRA135-DPO-001':["57", "82"],
  'RRD199ADPO':["57", "82"],
  'VSN012-DPO':["57", "19", "59"],
  'URD087A-DPO':["57"],
  'DSY005-DPO-001':["6", "5", "58", "67", "64", "72", "3", "16"],
  'KWY005-DPO':["58"],
  'MST069-DPO':["58", "70", "75", "35"],
  'MLR183A-DPO':["58"],
  'PKS019-UPO-001':["58"],
  'PST005-DPO':["58", "59", "19"],
  'RPK002-DPO-001':["58", "59", "57"],
  'RPK058-DPO':["58"],
  'TRT128A-DPO':["58"],
  'TRW016-DPO':["58"],
  'WSC026-DPO':["58"],
  'MAE206-DPO':["59"],
  'MAE241-DPO':["59"],
  'MAV311-DPO':["59"],
  'MAV356ADPO':["59"],
  'VSM009A-DPO':["19", "59", "57"],
  'DRP005-DPO':["5", "64", "78"],
  'DRP050-DPO':["5", "64"],
  'HRC064ADPO':["64"],
  'HRC120-DPO':["64"],
  'BRS017-DPO':["67"],
  'BRS055-DPO-001':["67"],
  'STK134-DPO':["16", "3", "5", "64", "67"],
  'SWC166-DPO':["5", "64", "67", "1", "3", "6", "16", "72"],
  'SWC181-DPO':["5", "64", "72", "3", "6", "16", "67", "1", "35", "30"],
  'HBE009-MPO':["35", "70", "75"],
  'MEP014-DPO':["70"],
  'RVR086-DPO':["70"],
  'RVR143-DPO':["70"],
  'SWS055-DPO':["70"],
  'WAR145-DPO':["70", "75"],
  'BRK009-DPO':["72"],
  'BRK053-DPO-001':["72"],
  'BRK071-DPO':["72", "75", "70"],
  'BRK076-DPO':["72", "70", "75"],
  'BRK092-DPO':["72"],
  'CMR002-DPO-001':["72", "5", "6", "16", "64", "67", "3"],
  'MLV133-DPO':["72", "16"],
  'BHE120-DPO':["75"],
  'BHE182-DPO':["75"],
  'BRH043-DPO':["75", "48"],
  'CRC062-DPO':["75"],
  'WPE090-DPO':["75", "48"],
  'CSP098-DPO':["78", "58"],
  'CSP164-DPO':["78", "5", "64"],
  'CSP209-DPO':["78", "67"],
  'CSR054-DPO':["78", "70"],
  'AVR016-DPO-001':["82", "59"],
  'HMS011-MPO':["82"],
  'RST045-DPO':["82"],
  'BSC006-DPO':["86", "96"],
  'BSC021-DPO':["86", "96"],
  'BSC053-DPO':["86", "96"],
  'LSD003-DPO':["30", "35", "86", "75", "70"],
  'NSF073-DPO':["35", "86", "30", "96"],
  'PRB027-DPO':["86"],
  'PRB140-DPO':["86"],
  'PRB213-DPO':["86"],
  'PRB316-DPO':["86"],
  'QPD117A-UPO':["86"],
  'SNC023-DPO':["86"],
  'NSF084-DPO':["86", "96"],
  'NSF176-DPO':["96"],
  'SKR146-DTP':["96"],
  'SKR003-DPO':["96", "16"],
  'BKR020-DPO':["109"],
  'CSC004-DPO':["11", "12", "48", "109"],
  'CSC025-DPO':["11", "109", "12", "48"],
  'CSC044-DPO':["11", "109", "12", "48"],
  'HSK033-DPO':["109", "48"],
  'HSK055-DPO':["109", "48"],
  'SSB003-DPO':["12", "96", "109", "35", "70", "75"],
  'VPE115ADPO':["109", "12"],
  'VSR179-UPO-001':["109"],
  'WHS006A-DPO':["109", "96"],
  'WHR015-DPO':["109"],
  'WHR093-DPO':["109"],
  'EGS139-DPO':["1", "3", "5", "8"],
  'FRD028-DPO':["57", "59"],
  'FRD051-DPO':["57", "59"],
  'EZT026-DPO':["19", "57", "59"],
  'FSC011-DPO':["75", "70", "35", "30"],
  'FSC027-DPO':["75", "70", "35", "30"],
  'FSC046-DPO':["75", "48", "109", "12"],
  'FSD002-DPO':["70", "75", "35", "30"],
  'FSD006-DPO':["70", "75", "35", "30"],
  'FSR004-MPO':["30"]
};


var GIS_POINTS=[
  {n:'Moreland Road',pole:'MLD003-DPO-UP',type:'Crossover',dir:'Up',ft:'Facing',rt:'0',la:-37.756559,lo:144.974024,surf:'Concrete'},
  {n:'Malvern Road',pole:'MLV133-DPO-UP',type:'Crossover',dir:'Up',ft:'Facing',rt:'0',la:-37.851545,lo:145.029228,surf:'Concrete'},
  {n:'Port Melbourne Light Rail',pole:'PMR075-DPO-DN',type:'Crossover',dir:'Down',ft:'Facing',rt:'0',la:-37.830947,lo:144.947454,surf:'Concrete'},
  {n:'Victoria Parade East Melbourne',pole:'VPE074-DPO-DN',type:'Crossover',dir:'Down',ft:'Facing',rt:'0',la:-37.808115,lo:144.975157,surf:'Concrete'},
  {n:'William Street',pole:'WSC026B-DPO-DN',type:'Crossover',dir:'Down',ft:'Facing',rt:'0',la:-37.808906,lo:144.955106,surf:'Concrete'},
  {n:'William Street',pole:'WSC026B-DPO-UP',type:'Crossover',dir:'Up',ft:'Facing',rt:'0',la:-37.809111,lo:144.955242,surf:'Concrete'},
  {n:'Pascoe Vale road',pole:'PVR150-DPO-PVRSD-PVR',type:'Siding',dir:'Down',ft:'Facing',rt:'0',la:-37.765957,lo:144.925019,surf:'Concrete'},
  {n:'Victoria Parade East Melbourne',pole:'VPE080BDPO-VPESD-VPE',type:'Siding',dir:'Both',ft:'Facing',rt:'0',la:-37.80834,lo:144.977538,surf:'Concrete'},
  {n:'Whiteman Street',pole:'WHS002-UPO-WHSSDS-WHSN',type:'Siding',dir:'?',ft:'Trailing',rt:'0',la:-37.825587,lo:144.95674,surf:'Concrete'},
  {n:'Melville Road',pole:'MLR223-DPO-MLRDN-MLR',type:'Terminus',dir:'Down',ft:'Facing',rt:'0',la:-37.740521,lo:144.945488,surf:'Concrete'},
  {n:'Mills Street',pole:'MMP132-DPO-MMPTT-MMPUP',type:'Terminus',dir:'Down',ft:'Facing',rt:'0',la:-37.850301,lo:144.955156,surf:'Concrete'},
  {n:'Nicholson Street East Coburg',pole:'NEC044-DPO-NECDN-NEC',type:'Terminus',dir:'Down',ft:'Trailing',rt:'0',la:-37.743184,lo:144.978049,surf:'Concrete'},
  {n:'Nicholson Street Fitzroy',pole:'NSF226-DPO-NSFDN-NSF',type:'Terminus',dir:'Down',ft:'Facing',rt:'0',la:-37.76726,lo:144.980272,surf:'Concrete'},
  {n:'Port Melbourne Light Rail',pole:'PMR111-DPO-PMRTT-PMRUP',type:'Terminus',dir:'Down',ft:'Facing',rt:'0',la:-37.840178,lo:144.933282,surf:'Concrete'},
  {n:'Plenty Road',pole:'PRB384-DPO-PRBDN-PRBTTN',type:'Terminus',dir:'Down',ft:'Facing',rt:'0',la:-37.679976,lo:145.069328,surf:'Concrete'},
  {n:'Plenty Road',pole:'PRB384-DPO-PRBTTS-PRBUP',type:'Terminus',dir:'Up',ft:'Facing',rt:'0',la:-37.679985,lo:145.069399,surf:'Concrete'},
  {n:'Park Street St Kilda',pole:'PSK063-DPO-PSKTT-PSKUP',type:'Terminus',dir:'Down',ft:'Facing',rt:'0',la:-37.860666,lo:144.974112,surf:'Concrete'},
  {n:'Riversdale Road',pole:'RVR213-DPO-RVRDN-RVR',type:'Terminus',dir:'Down',ft:'Trailing',rt:'0',la:-37.837592,lo:145.110342,surf:'Concrete'},
  {n:'Spencer Street',pole:'SNC031-UPO-SNCTT-SNCDN',type:'Terminus',dir:'?',ft:'Facing',rt:'0',la:-37.813029,lo:144.951362,surf:'Concrete'},
  {n:'Sydney Road Coburg',pole:'SRC117-DPO-SRCDN-SRC',type:'Terminus',dir:'Down',ft:'Trailing',rt:'0',la:-37.72823,lo:144.963706,surf:'Concrete'},
  {n:'Swanston Street',pole:'SWC143-UPO-SWCUP-SWC',type:'Terminus',dir:'?',ft:'Trailing',rt:'0',la:-37.797256,lo:144.964517,surf:'I-Beam'},
  {n:'Swanston Street',pole:'SWC145-UPO-SWCUP-SWC',type:'Terminus',dir:'?',ft:'Trailing',rt:'0',la:-37.797817,lo:144.964422,surf:'I-Beam'},
  {n:'Swanston Street',pole:'SWC147-UPO-SWCUP-SWC',type:'Terminus',dir:'?',ft:'Trailing',rt:'0',la:-37.79845,lo:144.964311,surf:'I-Beam'},
  {n:'Truganini Road',pole:'TRC217-DPO-TRCDN-TRC',type:'Terminus',dir:'Down',ft:'Trailing',rt:'0',la:-37.893754,lo:145.055551,surf:'Concrete'},
  {n:'Toorak Road South Yarra',pole:'TRT166A-DPO-DN',type:'Terminus',dir:'Down',ft:'Facing',rt:'0',la:-37.843572,lo:145.029637,surf:'Concrete'},
  {n:'Victoria Avenue',pole:'VAP135-DPO-VAPDN-VAP',type:'Terminus',dir:'Down',ft:'Facing',rt:'0',la:-37.846937,lo:144.948942,surf:'Concrete'},
  {n:'',pole:'VSR-TRM-VSR177-DPO-VSRSD-VSR',type:'Terminus',dir:'Down',ft:'Facing',rt:'0',la:-37.81165,lo:145.012299,surf:'Concrete'},
  {n:'Waverley Road',pole:'WEM005-DPO-WEMDN-WEM',type:'Terminus',dir:'Down',ft:'Trailing',rt:'0',la:-37.877205,lo:145.058322,surf:'Concrete'},
  {n:'Wellington Parade',pole:'WPE001-DPO-WPEDN-WPETTN',type:'Terminus',dir:'Down',ft:'Facing',rt:'0',la:-37.816743,lo:144.988568,surf:'Concrete'},
  {n:'Wellington Parade',pole:'WPE001-DPO-WPETTS-WPEUP',type:'Terminus',dir:'Up',ft:'Facing',rt:'0',la:-37.816777,lo:144.988563,surf:'Concrete'},
  {n:'Wattletree Road',pole:'WTL089-DPO-WTLDN-WTL',type:'Terminus',dir:'Down',ft:'Facing',rt:'0',la:-37.865007,lo:145.049343,surf:'Concrete'}
];

// ── LAYER MANAGEMENT ──
// (hoisted above)


// ── MARKER CREATION + LAYER MANAGEMENT (deferred until app.js ready) ──
(function(){
function _initGIS(){
var map=window.map,R=window.R,rks=window.rks,L=window.L;
var gisXoMkrs=window.gisXoMkrs,gisTermMkrs=window.gisTermMkrs,gisSidMkrs=window.gisSidMkrs;
var termMapMkrs=window.termMapMkrs,layerState=window.layerState,disruptions=window.disruptions;
var depotMkrs=window.depotMkrs,trams=window.trams,aR=window.aR,rLines=window.rLines;

GIS_XO.forEach(function(g){
  var xoRts=XO_ROUTES[g.pole]||[g.rt];
  var rtBadges=xoRts.map(function(r){var c=R[r]?R[r].c:'#888';return '<span style="background:'+c+'22;color:'+c+';border:1px solid '+c+'44;padding:1px 4px;border-radius:2px;font-size:9px;margin:1px">'+r+'</span>';}).join(' ');
  var icon=L.divIcon({className:'xo-diamond',html:'\u25C7',iconSize:[0,0],iconAnchor:[0,0]});
  var m=L.marker([g.la,g.lo],{icon:icon,zIndexOffset:120});
  m._xoRoutes=xoRts; // tag for disruption filtering
  m._pole=g.pole;
  var popup='<div style="min-width:200px;font-family:JetBrains Mono,monospace"><div style="font-size:12px;font-weight:700;color:#4fc3f7;margin-bottom:6px">\u25C6 '+g.pole+'</div>'+
    '<div style="font-size:10px;color:#8899aa;margin-bottom:4px">'+g.n+'</div>'+
    '<div style="margin:4px 0">'+rtBadges+'</div>'+
    (g.dir?'<div style="font-size:10px;padding:2px 0;border-top:1px solid #1f2d3d"><span style="color:#8899aa">Direction:</span> '+g.dir+'</div>':'')+
    (g.surf?'<div style="font-size:10px;padding:2px 0"><span style="color:#8899aa">Surface:</span> '+g.surf+'</div>':'')+
    (g.rtype?'<div style="font-size:10px;padding:2px 0"><span style="color:#8899aa">Type:</span> '+g.rtype+'</div>':'')+
    (g.cond&&g.cond!=='?'?'<div style="font-size:10px;padding:2px 0"><span style="color:#8899aa">Condition:</span> '+g.cond+'</div>':'')+
    '</div>';
  m.bindPopup(popup,{maxWidth:300});
  m.bindTooltip(g.pole,{direction:'top',offset:[0,-8]});
  gisXoMkrs.push(m);
});

GIS_POINTS.forEach(function(p){
  var sym,cls;
  if(p.type==='Terminus'){sym='\u25A0';cls='trm-diamond';}
  else if(p.type==='Siding'){sym='\u25E9';cls='sid-diamond';}
  else{sym='\u25C7';cls='xo-diamond';}
  var icon=L.divIcon({className:cls,html:sym,iconSize:[0,0],iconAnchor:[0,0]});
  var m=L.marker([p.la,p.lo],{icon:icon,zIndexOffset:110});
  var popup='<div style="min-width:180px;font-family:JetBrains Mono,monospace">'+
    '<div style="font-size:12px;font-weight:700;color:'+(p.type==='Terminus'?'#ff9800':(p.type==='Siding'?'#ab47bc':'#4fc3f7'))+'">'+sym+' '+p.pole+'</div>'+
    '<div style="font-size:10px;color:#8899aa;margin:4px 0">'+p.n+'</div>'+
    '<div style="font-size:10px"><span style="color:#8899aa">Type:</span> '+p.type+'</div>'+
    (p.rt?'<div style="font-size:10px"><span style="color:#8899aa">Route:</span> '+p.rt+'</div>':'')+
    '<div style="font-size:10px"><span style="color:#8899aa">Dir:</span> '+p.dir+' | '+p.ft+'</div>'+
    '<div style="font-size:10px"><span style="color:#8899aa">Surface:</span> '+p.surf+'</div></div>';
  m.bindPopup(popup,{maxWidth:280});
  m.bindTooltip(p.pole,{direction:'top',offset:[0,-8]});
  if(p.type==='Terminus')gisTermMkrs.push(m);
  else if(p.type==='Siding')gisSidMkrs.push(m);
  else gisXoMkrs.push(m);
});

window.toggleLayerMenu=function(){document.getElementById('layerMenu').classList.toggle('open');};

window.toggleLayer=function(name){
  layerState[name]=!layerState[name];
  applyLayerVis();
};

function applyLayerVis(){
  rks.forEach(function(k){var rl=rLines[k];if(!layerState.routes){map.removeLayer(rl);}else{if(!map.hasLayer(rl))map.addLayer(rl);}});
  trams.forEach(function(t){if(!layerState.trams){if(t.mk&&map.hasLayer(t.mk))map.removeLayer(t.mk);}else if(t.vis){if(t.mk&&!map.hasLayer(t.mk))map.addLayer(t.mk);}});
  depotMkrs.forEach(function(m){if(layerState.depots){if(!map.hasLayer(m))m.addTo(map);}else{map.removeLayer(m);}});
  // Crossovers: when disruption(s) active, only show markers for the affected routes
  var disRouteSet=[];
  disruptions.forEach(function(d){(d.routes||[d.route]).forEach(function(r){if(disRouteSet.indexOf(r)<0)disRouteSet.push(r);});});
  gisXoMkrs.forEach(function(m){
    if(!layerState.xovers){map.removeLayer(m);return;}
    var show=true;
    if(disRouteSet.length>0&&m._xoRoutes){
      show=m._xoRoutes.some(function(r){return disRouteSet.indexOf(r)>=0;});
    }
    if(show){if(!map.hasLayer(m))m.addTo(map);}else{map.removeLayer(m);}
  });
  gisTermMkrs.forEach(function(m){if(layerState.termini_gis){if(!map.hasLayer(m))m.addTo(map);}else{map.removeLayer(m);}});
  gisSidMkrs.forEach(function(m){if(layerState.sidings){if(!map.hasLayer(m))m.addTo(map);}else{map.removeLayer(m);}});
  termMapMkrs.forEach(function(m){if(layerState.termini_map){if(!map.hasLayer(m))m.addTo(map);}else{map.removeLayer(m);}});
}



window.applyLayerVis=applyLayerVis;
} // end _initGIS
if(window._opsviewReady)_initGIS();
else document.addEventListener("opsview-ready",_initGIS);
})();
