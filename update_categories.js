const { getCollection, setDoc } = require('./middleware/db');

const CATEGORY_IMAGES = {
  'saree': 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=800&q=80',
  'gowns': 'https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=800&q=80',
  'womans-jeans': 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=800&q=80',
  'others': 'https://images.unsplash.com/photo-1584916201218-f4242ceb4809?w=800&q=80',
  'dress': 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800&q=80',
  'blouse': 'https://images.unsplash.com/photo-1603204077874-ce419f8dd0e1?w=800&q=80',
  'mens-wear': 'https://images.unsplash.com/photo-1593030761757-71fae45fa0e7?w=800&q=80',
  'jewellery': 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800&q=80'
};

const TYPE_IMAGES = {
  'anti-tarnish-kada': 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=600&q=80',
  'baby-size-kada': 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=600&q=80',
  'bracelets': 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=600&q=80',
  'earrings-anti': 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&q=80',
  'rings-anti': 'https://images.unsplash.com/photo-1605100804763-247f67b2548e?w=600&q=80',
  'chains': 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=600&q=80',
  'waist-chain': 'https://images.unsplash.com/photo-1601121141461-9d6647bca1ed?w=600&q=80',
  'anklet': 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&q=80',
  'piercings': 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&q=80',
  'ear-cuffs': 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&q=80',
  'studs': 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&q=80',
  'mens-kada': 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=600&q=80',
  'mens-chain': 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=600&q=80',
  'nath': 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600&q=80',
  'zumka': 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&q=80',
  'manglsutra': 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600&q=80',
  'necklace': 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=600&q=80',
  'bangles': 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=600&q=80',
  'earrings-indian': 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&q=80',
  'rings-indian': 'https://images.unsplash.com/photo-1605100804763-247f67b2548e?w=600&q=80',
  'painjan': 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=600&q=80',
};

async function updateCategories() {
  const categories = await getCollection('categories');
  let count = 0;

  for (const data of categories) {
    let updated = false;

    if (!data.image && CATEGORY_IMAGES[data.slug]) {
      data.image = CATEGORY_IMAGES[data.slug];
      updated = true;
    }

    if (data.types && Array.isArray(data.types)) {
      data.types = data.types.map(type => {
        if (!type.image && TYPE_IMAGES[type.slug]) {
          updated = true;
          return { ...type, image: TYPE_IMAGES[type.slug] };
        }
        return type;
      });
    }

    if (updated) {
      await setDoc('categories', data.id, data);
      count++;
    }
  }

  if (count > 0) {
    console.log(`Successfully updated ${count} categories with images.`);
  } else {
    console.log('No categories needed updating.');
  }
}

updateCategories().catch(console.error);
