/* The updated activity kit changed who hosts Port.

   The earlier draft headed the Port block "UNHINGED · [UN] Bound", using the
   retired parent string in the division slot; the current kit heads it
   "[UN] Hinged · [UN] Bound". Two divisions host Port, not one — which is
   already exactly what src/lib/brand.ts says (hinged carries sea and port,
   bound carries port and premium) and is not what this catalogue said.

   Only two Port formats name a division in their own tile: MIXER is "[UN] Bound
   lifestyle evening" and GATHERING is "[UN] Bound private member night". Shore
   Leave, the pool social and the beach day name none — and Shore Leave in
   particular is the afterparty of a sailing that is Hinged, so filing it under
   Bound put the couples division's mark on the sandbar crowd's night out.

   Catalogue rows only. No sailing is filed under any format yet, so this moves
   a mark and nothing else. */
update public.activity_formats set division = 'hinged'
 where slug in ('shore_leave', 'pool_social', 'beach_day');
;
