// gis.js — GIS crossover, terminus, siding data + layer management

// ── DATA (global scope — needed by app.js disruption creation) ──
// YJM GIS Register crossover data — 36 mainline crossovers (MGA55 → WGS84)
var GIS_XO=[
  // ── Route 1 ──
  {n:'Lygon Street',pole:'LGB070-DPO',dir:'Bidir',rt:'1',la:-37.77784,lo:144.97079,cond:'A',surf:'Asphalt',rtype:'Tramway'},
  {n:'Park Street South Melbourne',pole:'PSM068-DPO',dir:'Bidir',rt:'1',la:-37.835391,lo:144.960957,cond:'C',surf:'Asphalt',rtype:'Tramway'},
  {n:'Southbank Boulevard',pole:'SBB006-DPO',dir:'Down Only',rt:'1',la:-37.823523,lo:144.969351,cond:'B',surf:'Asphalt',rtype:'Tramway'},
  {n:'Sturt Street',pole:'SSM026-DPO',dir:'Bidir',rt:'1',la:-37.82728,lo:144.966225,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Elgin Street',pole:'EGS139-DPO',dir:'Bidir',rt:'1',la:-37.733924,lo:144.966937,cond:'C',surf:'Asphalt',rtype:'Tramway'},
  // ── Route 3 ──
  {n:'Balaclava Road',pole:'BRC154-DPO',dir:'Bidir',rt:'3',la:-37.873647,lo:145.032569,cond:'A',surf:'Concrete',rtype:'Tramway'},
  // ── Route 5 ──
  {n:'Wattletree Road',pole:'WTL039-DPO',dir:'Bidir',rt:'5',la:-37.862581,lo:145.029262,cond:'C',surf:'Concrete',rtype:'Tramway'},
  // ── Route 6 ──
  {n:'Cameron Street',pole:'CST005-DPO',dir:'Bidir',rt:'6',la:-37.756089,lo:144.961976,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'High Street Prahran',pole:'HSP003-DPO',dir:'Bidir',rt:'6',la:-37.850337,lo:144.981704,cond:'B',surf:'Asphalt',rtype:'Shared'},
  {n:'High Street Prahran',pole:'HSP124-DPO',dir:'Bidir',rt:'6',la:-37.856492,lo:145.028204,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'High Street Prahran',pole:'HSP156-DPO',dir:'Bidir',rt:'6',la:-37.85811,lo:145.040593,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Moreland Road',pole:'MLD003-DPO',dir:'Bidir',rt:'6',la:-37.756632,lo:144.974024,cond:'C',surf:'Asphalt',rtype:'Shared'},
  // ── Route 11 ──
  {n:'Brunswick Street',pole:'BWS002-DPO',dir:'Bidir',rt:'11',la:-37.807685,lo:144.976907,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Miller Street (East)',pole:'MLE007-UPO',dir:'Up Only',rt:'11',la:-37.751891,lo:144.996679,cond:'A',surf:'Concrete',rtype:'Tramway'},
  {n:'Miller Street (East)',pole:'MLE008-DPO',dir:'Bidir',rt:'11',la:-37.75185,lo:144.996643,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Miller Street (East)',pole:'MLE020-DPO',dir:'Bidir',rt:'86',la:-37.752284,lo:145.000741,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'St Georges Road',pole:'SGN132A-UPO',dir:'Bidir',rt:'11',la:-37.774574,lo:144.990076,cond:'A',surf:'Concrete',rtype:'Reserved'},
  {n:'St Georges Road',pole:'SGN216-DPO',dir:'Bidir',rt:'11',la:-37.752417,lo:144.994836,cond:'B',surf:'Concrete',rtype:'Tramway'},
  // ── Route 12 ──
  {n:'Albert Road',pole:'ARS082-DPO',dir:'Bidir',rt:'12',la:-37.839477,lo:144.963009,cond:'C',surf:'Concrete',rtype:'Tramway'},
  // ── Route 16 ──
  {n:'Carlisle Street',pole:'CSK012-UPO',dir:'Bidir',rt:'16',la:-37.866912,lo:144.97914,cond:'C',surf:'Concrete',rtype:'Shared'},
  {n:'Dandenong Road Prahran',pole:'DRP094-DPO',dir:'Bidir',rt:'16',la:-37.865907,lo:145.026711,cond:'C',surf:'Ballast',rtype:'Tramway'},
  {n:'St Kilda Road',pole:'STK041A-DPO',dir:'Bidir',rt:'16',la:-37.831341,lo:144.971418,cond:'C',surf:'Asphalt',rtype:'Tramway'},
  {n:'St Kilda Road',pole:'STK052B-UPO',dir:'Bidir',rt:'16',la:-37.833888,lo:144.973489,cond:'B',surf:'Asphalt',rtype:'Reserved'},
  {n:'Swanston Street',pole:'SWC188ADPO',dir:'Bidir',rt:'16',la:-37.810573,lo:144.964226,cond:'C',surf:'Asphalt',rtype:'Tramway'},
  {n:'Swanston Street',pole:'SWC211-DPO',dir:'Bidir',rt:'78',la:-37.841712,lo:144.994979,cond:'C',surf:'Asphalt',rtype:'Tramway'},
  // ── Route 19 ──
  {n:'Sydney Road Brunswick',pole:'SRB165-DPO',dir:'Bidir',rt:'19',la:-37.777798,lo:144.96033,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Sydney Road Brunswick',pole:'SRB236-DPO-001',dir:'Bidir',rt:'19',la:-37.757748,lo:144.963761,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Sydney Road Coburg',pole:'SRC076-DPO',dir:'Bidir',rt:'19',la:-37.740811,lo:144.966727,cond:'C',surf:'Concrete',rtype:'Tramway'},
  // ── Route 30 ──
  {n:'Footscray Road Docklands',pole:'FSR004-MPO',dir:'Bidir',rt:'30',la:-37.749057,lo:144.943569,cond:'C',surf:'Asphalt',rtype:'Tram Lane'},
  {n:'Victoria Parade',pole:'VPE074-DPO',dir:'Bidir',rt:'30',la:-37.808184,lo:144.97483,cond:'C',surf:'Asphalt',rtype:'Shared'},
  // ── Route 35 ──
  {n:'LaTrobe Street',pole:'LSC003AUPO',dir:'Bidir',rt:'35',la:-37.812885,lo:144.952389,cond:'A',surf:'Asphalt',rtype:'Tramway'},
  {n:'LaTrobe Street',pole:'LSC029A-DPO',dir:'Bidir',rt:'35',la:-37.810673,lo:144.96021,cond:'A',surf:'Asphalt',rtype:'Tramway'},
  {n:'LaTrobe Street',pole:'LSC045A-DPO',dir:'Bidir',rt:'35',la:-37.809289,lo:144.964943,cond:'A',surf:'Asphalt',rtype:'Shared'},
  // ── Route 48 ──
  {n:'Bridge Road',pole:'BRR161-DPO-001',dir:'Bidir',rt:'48',la:-37.819894,lo:145.011907,cond:'C',surf:'Asphalt',rtype:'Tramway'},
  {n:'Collins Street Docklands',pole:'CSD003-DPO',dir:'Bidir',rt:'48',la:-37.820483,lo:144.949307,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'High Street Kew',pole:'HSK111-DPO',dir:'Bidir',rt:'48',la:-37.799719,lo:145.049793,cond:'C',surf:'Concrete',rtype:'Tramway'},
  // ── Route 57 ──
  {n:'Abbotsford Street',pole:'ABS090-DPO-001',dir:'Bidir',rt:'57',la:-37.79435,lo:144.947031,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Maribyrnong Road',pole:'MRA135-DPO-001',dir:'Bidir',rt:'57',la:-37.770633,lo:144.906046,cond:'A',surf:'Asphalt',rtype:'Shared'},
  {n:'Raleigh Road',pole:'RRD199ADPO',dir:'Bidir',rt:'57',la:-37.769262,lo:144.883913,cond:'C',surf:'Ballast',rtype:'Tramway'},
  {n:'Victoria Street North Melbourne',pole:'VSN012-DPO',dir:'Bidir',rt:'57',la:-37.80627,lo:144.958859,cond:'A',surf:'Asphalt',rtype:'Reserved'},
  {n:'Union Road',pole:'URD087A-DPO',dir:'Bidir',rt:'57',la:-37.778711,lo:144.915067,cond:'A',surf:'Asphalt',rtype:'Shared'},
  // ── Route 58 ──
  {n:'Domain Road',pole:'DSY005-DPO-001',dir:'Bidir',rt:'58',la:-37.833199,lo:144.974585,cond:'B',surf:'Concrete',rtype:'Tramway'},
  {n:'Kingsway',pole:'KWY005-DPO',dir:'Bidir',rt:'58',la:-37.827021,lo:144.961479,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Market Street',pole:'MST069-DPO',dir:'Bidir',rt:'58',la:-37.818882,lo:144.960929,cond:'C',surf:'Asphalt',rtype:'Tramway'},
  {n:'Melville Road',pole:'MLR183A-DPO',dir:'Bidir',rt:'58',la:-37.751604,lo:144.946057,cond:'A',surf:'Asphalt',rtype:'Shared'},
  {n:'Park Street South Melbourne',pole:'PKS019-UPO-001',dir:'Bidir',rt:'58',la:-37.832789,lo:144.970086,cond:'B',surf:'Asphalt',rtype:'Tram Lane'},
  {n:'Peel Street',pole:'PST005-DPO',dir:'Bidir',rt:'58',la:-37.802574,lo:144.956594,cond:'C',surf:'Ballast',rtype:'Tramway'},
  {n:'Royal Park',pole:'RPK002-DPO-001',dir:'Bidir',rt:'58',la:-37.793049,lo:144.948005,cond:'C',surf:'Asphalt',rtype:'Tramway'},
  {n:'Royal Park',pole:'RPK058-DPO',dir:'Bidir',rt:'58',la:-37.781017,lo:144.950009,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Toorak Road South Yarra',pole:'TRT128A-DPO',dir:'Bidir',rt:'58',la:-37.841902,lo:145.01502,cond:'C',surf:'Asphalt',rtype:'Tramway'},
  {n:'Toorak Road West',pole:'TRW016-DPO',dir:'Bidir',rt:'58',la:-37.837602,lo:144.98001,cond:'C',surf:'Asphalt',rtype:'Tram Lane'},
  {n:'William Street',pole:'WSC026-DPO',dir:'Bidir',rt:'58',la:-37.809184,lo:144.955242,cond:'B',surf:'Asphalt',rtype:'Tramway'},
  // ── Route 59 ──
  {n:'Elizabeth Street',pole:'EZT026-DPO',dir:'Bidir',rt:'59',la:-37.748986,lo:144.963894,cond:'A',surf:'Asphalt',rtype:'Tramway'},
  {n:'Flemington Road',pole:'FRD028-DPO',dir:'Bidir',rt:'59',la:-37.732201,lo:144.951210,cond:'C',surf:'Asphalt',rtype:'Tramway'},
  {n:'Flemington Road',pole:'FRD051-DPO',dir:'Bidir',rt:'59',la:-37.726961,lo:144.944627,cond:'C',surf:'Asphalt',rtype:'Tramway'},
  {n:'Mt Alexander Road Essendon',pole:'MAE206-DPO',dir:'Bidir',rt:'59',la:-37.754949,lo:144.917594,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Mt Alexander Road Essendon',pole:'MAE241-DPO',dir:'Bidir',rt:'59',la:-37.745284,lo:144.910775,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Matthews Avenue',pole:'MAV311-DPO',dir:'Bidir',rt:'59',la:-37.735565,lo:144.889267,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Matthews Avenue',pole:'MAV356ADPO',dir:'Bidir',rt:'59',la:-37.722689,lo:144.891412,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Victoria Street Melbourne',pole:'VSM009A-DPO',dir:'Bidir',rt:'59',la:-37.806463,lo:144.960301,cond:'A',surf:'Concrete',rtype:'Tramway'},
  // ── Route 64 ──
  {n:'Dandenong Road Prahran',pole:'DRP005-DPO',dir:'Bidir',rt:'64',la:-37.857918,lo:144.993255,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Dandenong Road Prahran',pole:'DRP050-DPO',dir:'Bidir',rt:'64',la:-37.860298,lo:145.010982,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Hawthorn Road',pole:'HRC064ADPO',dir:'Bidir',rt:'64',la:-37.885389,lo:145.022252,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Hawthorn Road',pole:'HRC120-DPO',dir:'Bidir',rt:'64',la:-37.900661,lo:145.019335,cond:'C',surf:'Concrete',rtype:'Tramway'},
  // ── Route 67 ──
  {n:'Brighton Road',pole:'BRS017-DPO',dir:'Bidir',rt:'67',la:-37.87238,lo:144.989808,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Brighton Road',pole:'BRS055-DPO-001',dir:'Bidir',rt:'67',la:-37.882376,lo:144.996061,cond:'C',surf:'Asphalt',rtype:'Tramway'},
  {n:'St Kilda Road',pole:'STK134-DPO',dir:'Bidir',rt:'67',la:-37.854591,lo:144.982195,cond:'C',surf:'Asphalt',rtype:'Tramway'},
  {n:'Swanston Street',pole:'SWC166-DPO',dir:'Bidir',rt:'67',la:-37.803661,lo:144.963421,cond:'A',surf:'Asphalt',rtype:'Tramway'},
  {n:'Swanston Street',pole:'SWC181-DPO',dir:'Bidir',rt:'67',la:-37.808947,lo:144.963476,cond:'C',surf:'Asphalt',rtype:'Tramway'},
  // ── Route 70 ──
  {n:'Flinders Street Docklands',pole:'FSD002-DPO',dir:'Bidir',rt:'70',la:-37.758395,lo:144.955727,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Flinders Street Docklands',pole:'FSD006-DPO',dir:'Bidir',rt:'70',la:-37.758717,lo:144.954619,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Harbour Esplanade',pole:'HBE009-MPO',dir:'Bidir',rt:'70',la:-37.81707,lo:144.945833,cond:'C',surf:'Asphalt',rtype:'Tramway'},
  {n:'Melbourne Park',pole:'MEP014-DPO',dir:'Down Only',rt:'70',la:-37.819721,lo:144.979225,cond:'B',surf:'Concrete',rtype:'Tramway'},
  {n:'Riversdale Road',pole:'RVR086-DPO',dir:'Bidir',rt:'70',la:-37.831756,lo:145.060033,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Riversdale Road',pole:'RVR143-DPO',dir:'Bidir',rt:'70',la:-37.834289,lo:145.082946,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Swan Street',pole:'SWS055-DPO',dir:'Down Only',rt:'70',la:-37.824599,lo:144.987977,cond:'A',surf:'Concrete',rtype:'Tramway'},
  {n:'Wallen Road',pole:'WAR145-DPO',dir:'Bidir',rt:'70',la:-37.827098,lo:145.02443,cond:'C',surf:'Concrete',rtype:'Shared'},
  // ── Route 72 ──
  {n:'Burke Road',pole:'BRK009-DPO',dir:'Bidir',rt:'72',la:-37.851651,lo:145.052702,cond:'A',surf:'Asphalt',rtype:'Tramway'},
  {n:'Burke Road',pole:'BRK053-DPO-001',dir:'Bidir',rt:'72',la:-37.837828,lo:145.055503,cond:'B',surf:'Concrete',rtype:'Tramway'},
  {n:'Burke Road',pole:'BRK071-DPO',dir:'Bidir',rt:'72',la:-37.831974,lo:145.056604,cond:'B',surf:'Concrete',rtype:'Tramway'},
  {n:'Burke Road',pole:'BRK076-DPO',dir:'Bidir',rt:'72',la:-37.830953,lo:145.056798,cond:'B',surf:'Concrete',rtype:'Tramway'},
  {n:'Burke Road',pole:'BRK092-DPO',dir:'Bidir',rt:'72',la:-37.826106,lo:145.05772,cond:'B',surf:'Concrete',rtype:'Tramway'},
  {n:'Commercial Road',pole:'CMR002-DPO-001',dir:'Bidir',rt:'72',la:-37.844963,lo:144.979437,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Malvern Road',pole:'MLV133-DPO',dir:'Bidir',rt:'72',la:-37.851545,lo:145.029229,cond:'C',surf:'Concrete',rtype:'Tramway'},
  // ── Route 75 ──
  {n:'Flinders Street City',pole:'FSC011-DPO',dir:'Bidir',rt:'75',la:-37.757073,lo:144.960133,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Flinders Street City',pole:'FSC027-DPO',dir:'Bidir',rt:'75',la:-37.755546,lo:144.965422,cond:'A',surf:'Concrete',rtype:'Tramway'},
  {n:'Flinders Street City',pole:'FSC046-DPO',dir:'Bidir',rt:'75',la:-37.753531,lo:144.972291,cond:'C',surf:'Asphalt',rtype:'Tramway'},
  {n:'Burwood Highway',pole:'BHE120-DPO',dir:'Bidir',rt:'75',la:-37.852105,lo:145.133219,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Burwood Highway',pole:'BHE182-DPO',dir:'Bidir',rt:'75',la:-37.852745,lo:145.152845,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Burwood Road',pole:'BRH043-DPO',dir:'Bidir',rt:'75',la:-37.820302,lo:145.017051,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Camberwell Road',pole:'CRC062-DPO',dir:'Bidir',rt:'75',la:-37.846105,lo:145.073494,cond:'B',surf:'Concrete',rtype:'Tramway'},
  {n:'Wellington Parade',pole:'WPE090-DPO',dir:'Bidir',rt:'75',la:-37.816575,lo:144.986157,cond:'A',surf:'Asphalt',rtype:'Tramway'},
  // ── Route 78 ──
  {n:'Chapel Street Prahran',pole:'CSP098-DPO',dir:'Bidir',rt:'78',la:-37.838917,lo:144.995723,cond:'C',surf:'Concrete',rtype:'Shared'},
  {n:'Chapel Street Prahran',pole:'CSP164-DPO',dir:'Bidir',rt:'78',la:-37.858183,lo:144.992163,cond:'C',surf:'Asphalt',rtype:'Tramway'},
  {n:'Chapel Street Prahran',pole:'CSP209-DPO',dir:'Bidir',rt:'78',la:-37.871117,lo:144.989833,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Church Street Richmond',pole:'CSR054-DPO',dir:'Bidir',rt:'78',la:-37.826201,lo:144.997829,cond:'C',surf:'Concrete',rtype:'Tramway'},
  // ── Route 82 ──
  {n:'Ascot Vale Road',pole:'AVR016-DPO-001',dir:'Bidir',rt:'82',la:-37.767923,lo:144.924706,cond:'C',surf:'Asphalt',rtype:'Shared'},
  {n:'Hampstead Road',pole:'HMS011-MPO',dir:'Bidir',rt:'82',la:-37.775745,lo:144.880032,cond:'A',surf:'Asphalt',rtype:'Tramway'},
  {n:'River Street',pole:'RST045-DPO',dir:'Bidir',rt:'82',la:-37.779838,lo:144.889982,cond:'C',surf:'Ballast',rtype:'Tramway'},
  // ── Route 86 ──
  {n:'Bourke Street City',pole:'BSC006-DPO',dir:'Bidir',rt:'86',la:-37.81664,lo:144.95489,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Bourke Street City',pole:'BSC021-DPO',dir:'Bidir',rt:'86',la:-37.815324,lo:144.959498,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Bourke Street City',pole:'BSC053-DPO',dir:'Bidir',rt:'86',la:-37.812459,lo:144.969351,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'LaTrobe Street Docklands',pole:'LSD003-DPO',dir:'Down Only',rt:'86',la:-37.81484,lo:144.945675,cond:'B',surf:'Asphalt',rtype:'Tramway'},
  {n:'Nicholson Street Fitzroy',pole:'NSF073-DPO',dir:'Bidir',rt:'86',la:-37.810173,lo:144.972846,cond:'B',surf:'Asphalt',rtype:'Tram Lane'},
  {n:'Plenty Road',pole:'PRB027-DPO',dir:'Down Only',rt:'86',la:-37.751427,lo:145.002359,cond:'C',surf:'Asphalt',rtype:'Tramway'},
  {n:'Plenty Road',pole:'PRB140-DPO',dir:'Down Only',rt:'86',la:-37.725295,lo:145.023596,cond:'A',surf:'Asphalt',rtype:'Tramway'},
  {n:'Plenty Road',pole:'PRB213-DPO',dir:'Bidir',rt:'86',la:-37.716372,lo:145.043387,cond:'C',surf:'Concrete',rtype:'Reserved'},
  {n:'Plenty Road',pole:'PRB316-DPO',dir:'Bidir',rt:'86',la:-37.695363,lo:145.059857,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Queens Parade',pole:'QPD117A-UPO',dir:'Bidir',rt:'86',la:-37.785875,lo:144.994328,cond:'B',surf:'Asphalt',rtype:'Tramway'},
  {n:'Spencer Street',pole:'SNC023-DPO',dir:'Bidir',rt:'86',la:-37.814509,lo:144.952042,cond:'B',surf:'Concrete',rtype:'Tramway'},
  // ── Route 96 ──
  {n:'Nicholson Street Fitzroy',pole:'NSF084-DPO',dir:'Bidir',rt:'96',la:-37.806855,lo:144.973399,cond:'A',surf:'Asphalt',rtype:'Tramway'},
  {n:'Nicholson Street Fitzroy',pole:'NSF176-DPO',dir:'Bidir',rt:'96',la:-37.781087,lo:144.97797,cond:'A',surf:'Asphalt',rtype:'Tramway'},
  {n:'St Kilda Light Rail',pole:'SKR146-DTP',dir:'Down Only',rt:'96',la:-37.850734,lo:144.966875,cond:'B',surf:'Concrete',rtype:'Tramway'},
  {n:'St Kilda Station',pole:'SKR003-DPO',dir:'Bidir',rt:'96',la:-37.858756,lo:144.977017,cond:'C',surf:'Concrete',rtype:'Tramway'},
  // ── Route 109 ──
  {n:'Barkers Road',pole:'BKR020-DPO',dir:'Bidir',rt:'109',la:-37.812841,lo:145.021011,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Collins Street City',pole:'CSC004-DPO',dir:'Bidir',rt:'109',la:-37.818703,lo:144.955472,cond:'B',surf:'Concrete',rtype:'Tramway'},
  {n:'Collins Street City',pole:'CSC025-DPO',dir:'Bidir',rt:'109',la:-37.816554,lo:144.962872,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Collins Street City',pole:'CSC044-DPO',dir:'Bidir',rt:'109',la:-37.814614,lo:144.96955,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'High Street Kew',pole:'HSK033-DPO',dir:'Bidir',rt:'109',la:-37.812357,lo:145.024275,cond:'B',surf:'Concrete',rtype:'Tramway'},
  {n:'High Street Kew',pole:'HSK055-DPO',dir:'Bidir',rt:'109',la:-37.807212,lo:145.029708,cond:'C',surf:'Concrete',rtype:'Tramway'},
  {n:'Spencer Street Bridge',pole:'SSB003-DPO',dir:'Down Only',rt:'109',la:-37.821932,lo:144.955421,cond:'B',surf:'Concrete',rtype:'Tramway'},
  {n:'Victoria Parade',pole:'VPE115ADPO',dir:'Bidir',rt:'109',la:-37.809806,lo:144.990067,cond:'C',surf:'Asphalt',rtype:'Shared'},
  {n:'Victoria Street Richmond',pole:'VSR179-UPO-001',dir:'Bidir',rt:'109',la:-37.811787,lo:145.012309,cond:'B',surf:'Asphalt',rtype:'Tramway'},
  {n:'Whiteman Street',pole:'WHS006A-DPO',dir:'Bidir',rt:'109',la:-37.826244,lo:144.956037,cond:'B',surf:'Asphalt',rtype:'Reserved'},
  {n:'Whitehorse Road',pole:'WHR015-DPO',dir:'Bidir',rt:'109',la:-37.81113,lo:145.066422,cond:'B',surf:'Concrete',rtype:'Tramway'},
  {n:'Whitehorse Road',pole:'WHR093-DPO',dir:'Down Only',rt:'109',la:-37.814827,lo:145.09721,cond:'B',surf:'Concrete',rtype:'Tramway'}
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
    '<div style="font-size:10px;padding:2px 0;border-top:1px solid #1f2d3d"><span style="color:#8899aa">Direction:</span> '+g.dir+'</div>'+
    '<div style="font-size:10px;padding:2px 0"><span style="color:#8899aa">Surface:</span> '+g.surf+'</div>'+
    '<div style="font-size:10px;padding:2px 0"><span style="color:#8899aa">Type:</span> '+g.rtype+'</div>'+
    (g.cond!=='?'?'<div style="font-size:10px;padding:2px 0"><span style="color:#8899aa">Condition:</span> '+g.cond+'</div>':'')+
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
