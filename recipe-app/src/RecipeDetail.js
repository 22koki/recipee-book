// RecipeDetail.js
import React from 'react';

const RecipeDetail = ({ recipe }) => {
  return (
    <div className="recipe-detail">
      <h2>{recipe.title}</h2>
      <p>{recipe.description}</p>
    </div>
  );
};

export default RecipeDetail;
