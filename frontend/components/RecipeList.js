// App.js (or App.jsx)
import React from 'react';
import RecipeList from './RecipeList'; // Adjust the import path based on your project structure
import './RecipeList.css'
const App = () => {
  const sampleRecipes = [
    { title: 'Spaghetti Bolognese', description: 'Classic Italian dish with pasta and meat sauce' },
    { title: 'Chicken Stir Fry', description: 'Quick and tasty stir-fried chicken with vegetables' },
    { title: 'Vegetarian Pizza', description: 'Delicious pizza topped with fresh vegetables' },
    { title: 'Chocolate Chip Cookies', description: 'Homemade cookies with gooey chocolate chips' },
    { title: 'Caprese Salad', description: 'Fresh salad with tomatoes, mozzarella, and basil' },
    { title: 'Beef Tacos', description: 'Tacos filled with seasoned beef, lettuce, and cheese' },
    { title: 'Pumpkin Soup', description: 'Comforting soup made with fresh pumpkin and spices' },
    { title: 'Mango Salsa', description: 'Refreshing salsa with ripe mango, tomatoes, and cilantro' },
    { title: 'Shrimp Scampi', description: 'Garlic-infused shrimp served over a bed of pasta' },
    { title: 'Vegetable Curry', description: 'Spicy curry with a mix of colorful vegetables' },
    // ... Add 40 more recipes
    { title: 'Blueberry Pancakes', description: 'Fluffy pancakes with fresh blueberries and maple syrup' },
    { title: 'Grilled Salmon', description: 'Healthy salmon fillets grilled to perfection' },
    { title: 'Stuffed Bell Peppers', description: 'Bell peppers filled with a savory rice and meat mixture' },
    { title: 'Cauliflower Wings', description: 'Crispy cauliflower bites coated in buffalo sauce' },
    { title: 'Ratatouille', description: 'Classic French vegetable stew bursting with flavors' },
    { title: 'Lemon Bars', description: 'Tangy and sweet lemon-flavored dessert bars' },
    { title: 'Spinach and Feta Stuffed Chicken', description: 'Juicy chicken breasts stuffed with spinach and feta' },
    { title: 'Tomato Basil Bruschetta', description: 'Toasted bread topped with fresh tomato and basil mixture' },
    { title: 'Teriyaki Tofu Bowl', description: 'Healthy bowl with teriyaki-glazed tofu and assorted veggies' },
    { title: 'Pesto Pasta with Cherry Tomatoes', description: 'Pasta tossed in basil pesto with cherry tomatoes' },
    // Add 30 more recipes
  ];

  return (
    <div>
      <h1>My Recipe App</h1>
      <RecipeList recipes={sampleRecipes} />
    </div>
  );
};

export default App;
