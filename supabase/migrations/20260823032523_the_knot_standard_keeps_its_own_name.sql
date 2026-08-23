-- The episode is titled "The knot standard." and uses knots throughout, but its
-- canonical, sitemap-published URL still said /episodes/the-fathom-standard.
update public.dispatch_posts
set slug = 'the-knot-standard'
where slug = 'the-fathom-standard';
