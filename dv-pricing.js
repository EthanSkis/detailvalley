/* Detail Valley — the one price list.
   Loaded by index.html (the booking flow) and quote.html (the private quoting
   tool), so the two can never disagree: what a customer is charged online and
   what the quoting tool works from are the same numbers, edited in one place.

   price = dollars. min = minutes on the job; it drives the booking flow's
   finish estimate, how much time a booking blocks on the calendar, and the
   time on site the quoting tool shows.

   The homepage package cards and FAQ in index.html state prices and times as
   plain text (so they show with JavaScript off and for search engines). If you
   change a package price or time here, update that text too. */
window.DV_PRICING = {
  packages: [
    {id:'maintenance', name:'Maintenance Wash', price:85,  min:105, meta:'Exterior wash · ~1½–2 hrs'},
    {id:'interior',    name:'Interior Detail',  price:185, min:150, meta:'Inside only · ~2–3 hrs', includes:['intglass'], excludes:['wax']},
    {id:'full',        name:'Full Detail',      price:295, min:300, meta:'Inside & out · ~5 hrs', includes:['intglass']},
    {id:'showroom',    name:'Showroom',         price:360, min:360, meta:'Adds clay bar & wax · ~6 hrs', includes:['intglass']}
  ],
  // Vehicle size surcharge — bigger rigs take more time. 'standard' is the default (no charge).
  sizes: [
    {id:'standard', name:'Sedan / coupe',                 note:'No extra charge',       price:0,  min:0},
    {id:'midsize',  name:'SUV / crossover / small truck', note:'More surface to cover', price:30, min:30},
    {id:'oversize', name:'Large truck / 3-row SUV / van', note:'The big rigs',          price:60, min:60}
  ],
  addons: [
    {id:'pet',      name:'Pet hair removal',                   price:40, min:30},
    {id:'dirt',     name:'Excessive dirt, mud or sand',        price:30, min:30},
    {id:'engine',   name:'Engine bay wipe-down',               price:25, min:20},
    {id:'intglass', name:'Interior glass refresh',             price:15, min:10},
    {id:'wax',      name:'Extra wax coat — longer protection', price:30, min:20}
  ]
};
