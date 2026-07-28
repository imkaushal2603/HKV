

async function getRowByExport() {

    let url = `https://api.hubapi.com/cms/hubdb/2026-03/tables/1246109892/rows`;


    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Update error ${response.status}: ${err}`);
    }

    return await response.json();
}

const getNames = (items = []) => items.map(item => item.name).filter(Boolean);

function matchesCourse(course, searchText = "") {
    if (!searchText) return true;

    const search = searchText.trim().toLowerCase();

    const fields = [
        course.title,
        course.description,
        course.url,
        course.detailsLink,
        course.level,
        course.format,
        course.subsidy,
        course.businessUnit,
        course.currency_symbol,
        course.price,
        course.priceSectionSubTitle,
        course.date,
        course.timeHours,
        course.registerUrl,

        ...course.course_tag,
        ...course.more,
        ...course.branchName,
        ...course.nextIntake,
        ...course.detailsTabList,
        ...course.authors,
    ];

    return fields.some(field =>
        field &&
        field.toString().toLowerCase().includes(search)
    );
}

async function getNextIntakeData(searchText = "Dipl") {
    try {
        const data = await getRowByExport();

        const result = [];

        for (const row of data.results) {

            const nextIntake = (row.values.next_intake || []).map(x => x.name);
            const detailsTabList = (row.values.details_tab_list || []).map(x => x.name);
            const authors = (row.values.author || []).map(x => x.name);

            const course = {
                rowId: row.id,
                url: row.path,
                course_tag: getNames(row.values.course_tag),
                level: row.values.level?.label ?? null,
                format: row.values.course_format?.label ?? null,
                subsidy: row.values.subsidy?.label ?? null,
                more: getNames(row.values.more),
                branchName: getNames(row.values.branch_name),

                video: row.values.video?.url ?? null,
                image: row.values.courses_image?.url ?? null,
                wantOverlayImage: row.values.want_overlay_image ?? null,
                overlayImage: row.values.overlay_image?.url ?? null,
                title: row.name,
                description: row.values.content,
                detailsLink: row.path,
                currency_symbol: row.values.currency_symbols?.name ?? null,
                price: row.values.price ?? null,
                priceSectionSubTitle: row.values.course_details_price_info ?? null,
                date: row.values.start_date
                    ? new Date(row.values.start_date).toISOString()
                    : null,
                timeHours: row.values.time ?? null,
                registerUrl: row.values.register_url ?? null,
                showCourseDetailsButtons: row.values.course_details_pop_dailog ?? null,
                businessUnit: row.values.business_unit?.label ?? null,

                nextIntake,
                detailsTabList,
                authors
            };

            if (!matchesCourse(course, searchText)) {
                continue;
            }

            result.push(course);
        }
        return result;

    } catch (error) {
        console.error(error);
    }
}

module.exports = {
    getNextIntakeData
};