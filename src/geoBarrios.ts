// Coordenadas de referencia para centrar el mapa del pedido.
// Generado una sola vez desde OpenStreetMap (Nominatim), verificando que cada barrio
// esté en su localidad. Los barrios sin punto exacto usan el centro de su localidad.

type Punto = [number, number];

interface ZonaGeo {
  centro: Punto | null;
  barrios: Record<string, Punto>;
}

const MUNICIPIO_CENTRO: Record<string, Punto> = {"Bogotá D.C.": [4.60971, -74.08175], "Soacha": [4.57937, -74.21682]};

const GEO_BARRIOS: Record<string, Record<string, ZonaGeo>> = {
  "Bogotá D.C.": {
    "Usaquén (Localidad 1)": { centro: [4.71326, -74.04367], barrios: {"Cedritos": [4.72705, -74.04439], "Santa Bárbara": [4.69461, -74.04337], "Toberín": [4.74161, -74.04075], "San Cristóbal Norte": [4.73822, -74.02277], "La Carolina": [4.70651, -74.03906], "Orquídeas": [4.7392, -74.03338], "Verbenal": [4.76388, -74.03283], "Los Cedros": [4.7244, -74.03524], "Country Club": [4.71104, -74.04208]} },
    "Chapinero (Localidad 2)": { centro: [4.65722, -74.04643], barrios: {"Chicó": [4.6733, -74.05458], "El Nogal": [4.66032, -74.05356], "Rosales": [4.65702, -74.04974], "Pardo Rubio": [4.63849, -74.05694]} },
    "Santa Fe (Localidad 3)": { centro: [4.60858, -74.06075], barrios: {"La Macarena": [4.61262, -74.06393], "Las Nieves": [4.6021, -74.07273], "La Perseverancia": [4.61724, -74.06451], "Las Cruces": [4.58929, -74.08117], "Lourdes": [4.58832, -74.07177], "El Dorado": [4.58063, -74.07225], "San Bernardo": [4.59394, -74.08535]} },
    "San Cristóbal (Localidad 4)": { centro: [4.55845, -74.08872], barrios: {"20 de Julio": [4.56671, -74.09514], "San Blas": [4.56534, -74.0831], "Bello Horizonte": [4.56245, -74.09259], "La Gloria": [4.54913, -74.09198], "Ramajal": [4.56078, -74.08158], "San Cristóbal Sur": [4.57191, -74.08025], "Los Libertadores": [4.53574, -74.08961], "Sosiego": [4.57862, -74.08676]} },
    "Usme (Localidad 5)": { centro: [4.5148, -74.09736], barrios: {"Santa Librada": [4.51737, -74.11557], "La Aurora": [4.52319, -74.12281], "Gran Yomasa": [4.514, -74.10828], "Alfonso López": [4.49832, -74.10249], "Comuneros": [4.50763, -74.11467], "Ciudad Usme": [4.47365, -74.1108], "La Flora": [4.5079, -74.08993], "El Bosque": [4.50561, -74.10062]} },
    "Tunjuelito (Localidad 6)": { centro: [4.5729, -74.1343], barrios: {"Venecia": [4.58621, -74.13889], "Tunjuelito": [4.55843, -74.1285], "San Carlos": [4.56656, -74.13072], "El Carmen": [4.58271, -74.13368], "Fátima": [4.58739, -74.1374], "San Vicente Ferrer": [4.58189, -74.14046], "Isla del Sol": [4.5891, -74.15381], "Nuevo Muzú": [4.58725, -74.14891]} },
    "Bosa (Localidad 7)": { centro: [4.61802, -74.1943], barrios: {"El Recreo": [4.63626, -74.20221], "Chicalá": [4.62493, -74.18069], "San Bernardino": [4.61603, -74.206], "Los Naranjos": [4.60708, -74.19465], "La Palestina": [4.6111, -74.19358], "El Porvenir": [4.64109, -74.18878], "Bosa La Estación": [4.59747, -74.18314], "Villa del Río": [4.60107, -74.15891]} },
    "Kennedy (Localidad 8)": { centro: [4.6315, -74.14899], barrios: {"Castilla": [4.64476, -74.14157], "Timiza": [4.609, -74.16163], "Carvajal": [4.60865, -74.14141], "Marsella": [4.63206, -74.1304], "Patio Bonito": [4.64043, -74.16928], "Américas Occidental": [4.62555, -74.14042], "Class": [4.6137, -74.17841], "Corabastos": [4.63112, -74.16126], "Bavaria": [4.63809, -74.12847]} },
    "Fontibón (Localidad 9)": { centro: [4.67506, -74.13266], barrios: {"Modelia": [4.66648, -74.12281], "Hayuelos": [4.66694, -74.13625], "Ciudad Salitre Occidental": [4.65476, -74.11088], "Capellanía": [4.67752, -74.12614], "Zona Franca": [4.67704, -74.15574], "Versalles": [4.68389, -74.14387], "El Refugio": [4.65601, -74.12815]} },
    "Engativá (Localidad 10)": { centro: [4.70917, -74.11029], barrios: {"Villas de Granada": [4.7154, -74.12337], "Las Ferias": [4.68309, -74.09026], "Garcés Navas": [4.71606, -74.12205], "Normandía": [4.66841, -74.10677], "Quirigua": [4.70744, -74.10361], "Bolivia": [4.72558, -74.11636], "El Encanto": [4.6788, -74.10523], "Florida Blanca": [4.69331, -74.11094]} },
    "Suba (Localidad 11)": { centro: [4.74052, -74.07969], barrios: {"Niza": [4.71989, -74.07418], "Mazurén": [4.7367, -74.05161], "Suba Compartir": [4.75563, -74.10498], "Lombardía": [4.74802, -74.10196], "El Rincón": [4.73467, -74.09547], "Tibabuyes": [4.74965, -74.11662], "San José de Bavaria": [4.7619, -74.05543], "La Floresta": [4.70135, -74.08288], "Britalia": [4.74802, -74.05717]} },
    "Barrios Unidos (Localidad 12)": { centro: [4.66439, -74.07497], barrios: {"Siete de Agosto": [4.65861, -74.07345], "La Castellana": [4.68206, -74.06093], "Alcázares": [4.66242, -74.06893], "Doce de Octubre": [4.67145, -74.07854], "Rionegro": [4.68234, -74.06566]} },
    "Teusaquillo (Localidad 13)": { centro: [4.64158, -74.0858], barrios: {"Galerías": [4.64256, -74.07283], "La Esmeralda": [4.64743, -74.08628], "Ciudad Salitre Oriental": [4.64307, -74.10106], "Quinta Paredes": [4.63243, -74.09035], "Nicolás de Federmán": [4.64903, -74.08253], "Pablo VI": [4.65145, -74.08973], "Armenia": [4.61894, -74.07299], "El Recuerdo": [4.63003, -74.08657]} },
    "Los Mártires (Localidad 14)": { centro: [4.60483, -74.08547], barrios: {"La Sabana": [4.61252, -74.08295], "Santa Isabel": [4.59916, -74.09664]} },
    "Antonio Nariño (Localidad 15)": { centro: [4.58947, -74.10462], barrios: {"Restrepo": [4.59179, -74.10666], "Ciudad Jardín": [4.58334, -74.09418], "Santander": [4.59314, -74.10937], "San Antonio": [4.58975, -74.09396], "Policarpa": [4.58688, -74.08874], "La Fragua": [4.59489, -74.10765], "Caracas": [4.58364, -74.09332], "La Hortúa": [4.59003, -74.08913]} },
    "Puente Aranda (Localidad 16)": { centro: [4.61478, -74.11458], barrios: {"Ciudad Montes": [4.60772, -74.11107], "Muzú": [4.59935, -74.12679], "Alquería": [4.59788, -74.13537], "Milenta": [4.61863, -74.12539], "Salazar Gómez": [4.63087, -74.11425], "San Rafael": [4.62083, -74.11821], "El Remanso": [4.59851, -74.11337], "Galán": [4.61794, -74.1214]} },
    "La Candelaria (Localidad 17)": { centro: [4.59682, -74.07167], barrios: {"La Concordia": [4.59784, -74.06985], "La Catedral": [4.59996, -74.0744], "Las Aguas": [4.60076, -74.06655], "Belén": [4.59111, -74.07296], "Centro Administrativo": [4.59766, -74.07755]} },
    "Rafael Uribe Uribe (Localidad 18)": { centro: [4.56502, -74.11444], barrios: {"Quiroga": [4.57877, -74.11773], "Olaya": [4.58188, -74.10716], "San José": [4.57392, -74.10406], "Marco Fidel Suárez": [4.57119, -74.11629], "Diana Turbay": [4.54452, -74.10883], "Claret": [4.58317, -74.12763], "Gustavo Restrepo": [4.57655, -74.10779], "El Inglés": [4.58411, -74.12385], "Granjas de San Pablo": [4.57324, -74.11671]} },
    "Ciudad Bolívar (Localidad 19)": { centro: [4.56582, -74.16179], barrios: {"Jerusalén": [4.57469, -74.15804], "Ismael Perdomo": [4.58801, -74.1701], "San Francisco": [4.56678, -74.14723], "Arborizadora Alta": [4.56769, -74.16249], "Arborizadora Baja": [4.57083, -74.1486], "Meissen": [4.55974, -74.13644], "El Tesoro": [4.53811, -74.14311], "Sierra Morena": [4.57809, -74.16872], "Lucero Alto": [4.55788, -74.14009], "Candelaria La Nueva": [4.57018, -74.1504]} },
    "Sumapaz (Localidad 20)": { centro: null, barrios: {} },
  },
  "Soacha": {
    "Comuna 1 - Compartir": { centro: [4.56494, -74.24129], barrios: {"Compartir": [4.56494, -74.24129], "Ciudad Latina": [4.57547, -74.24626], "Llanos de Soacha": [4.57862, -74.24597], "Parque Campestre": [4.57952, -74.23181], "Tequendama": [4.58524, -74.219], "Santa Ana": [4.56632, -74.23584]} },
    "Comuna 2 - Centro": { centro: [4.59074, -74.21561], barrios: {"Centro Soacha": [4.58332, -74.2188], "El Sol": [4.58119, -74.21161], "Las Villas": [4.57813, -74.21474], "San Marcos": [4.57531, -74.21763], "El Nogal": [4.58599, -74.20873], "La Veredita": [4.58658, -74.22934]} },
    "Comuna 3 - La Despensa": { centro: [4.59926, -74.20671], barrios: {"La Despensa": [4.59926, -74.20671], "León XIII": [4.59321, -74.19566], "Ciudad Verde": [4.60835, -74.21876], "La Amistad": [4.58588, -74.21012], "Los Olivos": [4.59947, -74.20061], "Santillana": [4.58648, -74.18798]} },
    "Comuna 4 - Cazucá": { centro: [4.57887, -74.18528], barrios: {"Altos de Cazucá": [4.57523, -74.18444], "Ciudadela Sucre": [4.56611, -74.18538], "Julio Rincón": [4.58534, -74.18901], "Luis Carlos Galán": [4.58074, -74.18139], "Villa Mercedes": [4.58253, -74.18524], "Buenos Aires": [4.56478, -74.18432]} },
    "Comuna 5 - San Mateo": { centro: [4.58353, -74.19635], barrios: {"San Mateo": [4.58353, -74.19635], "Casalinda": [4.58033, -74.202], "Sumapaz": [4.58076, -74.19928], "Las Margaritas": [4.56448, -74.18806]} },
    "Comuna 6 - San Humberto": { centro: [4.57196, -74.21454], barrios: {"San Humberto": [4.57196, -74.21454], "Chicó Sur": [4.57512, -74.21328], "La Florida": [4.56968, -74.21722], "El Bosque": [4.57681, -74.21068], "Santa Helena": [4.5849, -74.21462], "Hogares Soacha": [4.59329, -74.22599]} },
  },
};

export type PrecisionUbicacion = 'barrio' | 'localidad' | 'municipio';

// Punto más preciso disponible para lo que el cliente ha seleccionado.
export function ubicarBarrio(municipio: string, localidad: string, barrio: string): { punto: Punto; precision: PrecisionUbicacion } | null {
  const zona = GEO_BARRIOS[municipio]?.[localidad];
  const exacto = barrio ? zona?.barrios[barrio] : undefined;
  if (exacto) return { punto: exacto, precision: 'barrio' };
  if (zona?.centro) return { punto: zona.centro, precision: 'localidad' };
  const centroMunicipio = MUNICIPIO_CENTRO[municipio];
  return centroMunicipio ? { punto: centroMunicipio, precision: 'municipio' } : null;
}
