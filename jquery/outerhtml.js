jQuery.fn.outerHTML = function jQuery$outerHTML()
{
	return $(this).clone().wrap('<p>').parent().html();
};
