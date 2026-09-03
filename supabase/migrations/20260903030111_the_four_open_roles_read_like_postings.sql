-- The seed content the hardcoded page carried, expanded into what a posting
-- owes a candidate. The blurbs are the page's own words and they were good;
-- what follows them is new.
--
-- COMP IS DELIBERATELY NOT A NUMBER. No band has been set by the owner, and a
-- job page is the last place to invent one — a figure here becomes the figure a
-- candidate holds the club to. Each row says when the number arrives instead,
-- which is true and is what the first call is for.

update public.crew_roles set
  dept = 'Deck', employment = 'Part time', remote = false,
  body = 'You are the reason a nervous first-timer ends the day asking when the next one is. The boat is the setting; the guests are the show. Both need someone who is unhurried in weather and honest about it.',
  responsibilities = array[
    'Rig, sail and unrig the boat, and leave it better than the last crew did.',
    'Brief every guest on safety without making it the mood of the day.',
    'Teach whoever wants to learn, at whatever level they arrive.',
    'Read the weather early and say so — a hold called at 18:00 the night before is the job working.'
  ],
  requirements = array[
    'ASA 104 or the equivalent in miles and scar tissue.',
    'Swim 200 metres, tread for 10 minutes.',
    'VHF, and the judgment to use it before you need it.',
    'A clean record on the water.'
  ],
  nice_to_have = array[
    'Captain''s licence.',
    'A second language spoken well enough to teach in.',
    'You have worked a season somewhere the weather does what it likes.'
  ],
  comp = 'Hourly, plus the day rate on sailing days. The number is on the first call — we would rather say it out loud than post a range we then argue about.',
  process = array[
    'A call, half an hour, with the person you would work for.',
    'A day on the water with a crew, paid.',
    'A decision inside the week either way.'
  ]
where title = 'Deckhand';

update public.crew_roles set
  dept = 'Ashore', employment = 'Full time', remote = false,
  body = 'Thirty-four of the fifty-two episodes never leave land, and this is the person who owns them. Long tables, records, the golden hour, the rooms nobody else in the city can get. If the ashore half of the season is good, it is because of you.',
  responsibilities = array[
    'Find and hold the rooms — restaurants, roofs, studios, the places that do not have a booking page.',
    'Run the night itself, from the first hello to the last cab.',
    'Own the relationships: chefs, owners, door staff, the people who make a room say yes twice.',
    'Work with the Bridge on the calendar so the ashore series land where they should in the week.'
  ],
  requirements = array[
    'A hospitality background deep enough that the good rooms already take your call.',
    'You have run a room on a bad night and nobody in it could tell.',
    'Allergic to boring rooms.'
  ],
  nice_to_have = array[
    'You already live in Los Angeles and have opinions about it.',
    'Production experience — the cameras are in the room too.'
  ],
  comp = 'Salaried, with a share of what the ashore season makes. Stated in full on the first call.',
  process = array[
    'A call, half an hour.',
    'A night out — you take us somewhere and tell us why it is the right room.',
    'A conversation with the Producer team, then a decision.'
  ]
where title = 'Shore lead';

update public.crew_roles set
  dept = 'Shoreside', employment = 'Full time', remote = false,
  body = 'The first voice a member hears and the last one off the dock. The manifest, the gangway, the weather calls — the unglamorous spine that makes forty strangers feel expected rather than processed.',
  responsibilities = array[
    'Run the manifest for every episode, afloat and ashore.',
    'Work the gangway: check-in, guests, the person who turns up at the wrong marina.',
    'Make the weather calls with the Deck team and tell members before they ask.',
    'Answer Shoreside mail like a person, inside the day.'
  ],
  requirements = array[
    'Operations experience where the deadline was an actual departure.',
    'Calm in front of forty people when something has gone wrong.',
    'Writes clearly and quickly — most of this job is a short message sent early.'
  ],
  nice_to_have = array[
    'Time on boats, or in events, or both.',
    'You have used a system like the Bridge and have opinions about what it got wrong.'
  ],
  comp = 'Salaried. Stated in full on the first call.',
  process = array[
    'A call, half an hour.',
    'A shift on a real episode, paid, on the gangway with the current crew.',
    'A decision inside the week.'
  ]
where title = 'Gangway ops';

update public.crew_roles set
  dept = 'Engineering', employment = 'Full time', remote = true,
  body = 'The club runs on a ledger, a manifest, and an agent called the Producer that minds them. It is a small codebase with unusually strong opinions, and the money path is real: a bug here charges somebody. TypeScript on the surface, judgment underneath.',
  responsibilities = array[
    'Build and hold the ledger, the manifest and the Producer.',
    'Keep the money path honest — idempotency, refunds, the things that must never run twice.',
    'Write the gates. This repository proves its own migrations replay; keep it that way.',
    'Work directly with the Bridge crew who use what you build, because they are down the hall and they will tell you.'
  ],
  requirements = array[
    'TypeScript and Postgres, deeply — row-level security is a design tool here, not a checkbox.',
    'You have shipped something that took money and did not lose any.',
    'You write for the next reader. This codebase comments the why, not the what.'
  ],
  nice_to_have = array[
    'Next.js App Router, Supabase, Stripe.',
    'You have been the person who got paged.'
  ],
  comp = 'Salaried, remote, with equity. Stated in full on the first call.',
  process = array[
    'A call, half an hour, no whiteboard.',
    'A paid day on a real ticket in the real codebase.',
    'A conversation about what you found wrong with it, then a decision.'
  ]
where title = 'The Producer engineering';
;
