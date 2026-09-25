// Tipus mínims perquè TypeScript pugui revisar el codi de l'app (js/*.js, scripts clàssics) sense tocar-lo.
// La revisió busca errors que el navegador només trobaria en executar-se: noms que no existeixen, funcions
// declarades dues vegades en fitxers diferents, crides amb massa arguments, propietats mal escrites…
// Els objectes del DOM i de Firebase es deixen oberts (any): aquí no es vol revisar el tipus de cada element.
declare var firebase: any;
interface Window { [key: string]: any; }
interface Document { [key: string]: any; }
interface Element { [key: string]: any; }
interface EventTarget { [key: string]: any; }
interface Event { [key: string]: any; }
interface Navigator { [key: string]: any; }
interface CSSStyleDeclaration { [key: string]: any; }
